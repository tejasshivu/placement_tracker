import { useEffect, useState } from "react";
import api from "../api";
import { downloadPdf } from "../downloadResume";
import DashboardTabs from "../components/DashboardTabs";

const emptyReport = {
  summary: {
    students: 0,
    companies_total: 0,
    companies_approved: 0,
    companies_pending: 0,
    drives_total: 0,
    drives_active: 0,
    applications_total: 0,
    selection_rate_percent: 0,
  },
  by_status: {
    applied: 0,
    shortlisted: 0,
    selected: 0,
    rejected: 0,
  },
  by_company: [],
  by_branch: [],
};

export default function PlacementDashboard() {
  const [tab, setTab] = useState("reports");
  const [pending, setPending] = useState([]);
  const [students, setStudents] = useState([]);
  const [drives, setDrives] = useState([]);
  const [report, setReport] = useState(emptyReport);
  const [announcement, setAnnouncement] = useState({ title: "", body: "" });
  const [announcements, setAnnouncements] = useState([]);
  const [message, setMessage] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [savingStudent, setSavingStudent] = useState(false);
  const [blockedDates, setBlockedDates] = useState([]);
  const [blockForm, setBlockForm] = useState({
    title: "",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [scheduleNotes, setScheduleNotes] = useState({});
  const [scheduleDates, setScheduleDates] = useState({});

  const load = async () => {
    const [p, d, a, r, st, b] = await Promise.all([
      api.get("/placement/companies/pending"),
      api.get("/drives"),
      api.get("/placement/announcements"),
      api.get("/placement/reports"),
      api.get("/placement/students"),
      api.get("/placement/blocked-dates"),
    ]);
    setPending(p.data);
    setDrives(d.data);
    setAnnouncements(a.data);
    setReport(r.data);
    setStudents(st.data);
    setBlockedDates(b.data);
  };

  useEffect(() => {
    load().catch(() => setMessage("Could not load placement data"));
  }, []);

  const approve = async (companyId) => {
    await api.post(`/placement/companies/${companyId}/approve`);
    setMessage("Company approved");
    await load();
  };

  const postAnnouncement = async (e) => {
    e.preventDefault();
    await api.post("/placement/announcements", announcement);
    setAnnouncement({ title: "", body: "" });
    setMessage("Announcement posted");
    await load();
  };

  const openStudent = async (studentId) => {
    setDetailError("");
    try {
      const { data } = await api.get(`/placement/students/${studentId}`);
      setSelectedStudent(data);
      setEditForm({
        full_name: data.full_name || "",
        email: data.email || "",
        branch: data.branch || "",
        year: data.year ?? "",
        cgpa: data.cgpa ?? "",
        phone: data.phone || "",
      });
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not load student details");
    }
  };

  const closeStudent = () => {
    setSelectedStudent(null);
    setEditForm(null);
    setDetailError("");
  };

  const saveStudent = async (e) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setSavingStudent(true);
    setDetailError("");
    try {
      const { data } = await api.patch(`/placement/students/${selectedStudent.id}`, {
        ...editForm,
        year: editForm.year === "" ? null : Number(editForm.year),
        cgpa: editForm.cgpa === "" ? null : Number(editForm.cgpa),
      });
      setSelectedStudent(data);
      setEditForm({
        full_name: data.full_name || "",
        email: data.email || "",
        branch: data.branch || "",
        year: data.year ?? "",
        cgpa: data.cgpa ?? "",
        phone: data.phone || "",
      });
      setMessage("Student details updated");
      await load();
    } catch (err) {
      setDetailError(err.response?.data?.error || "Could not save student details");
    } finally {
      setSavingStudent(false);
    }
  };

  const scheduleAction = async (driveId, action) => {
    try {
      const { data } = await api.post(`/drives/${driveId}/schedule`, {
        action,
        placement_note: scheduleNotes[driveId] || "",
        drive_date: scheduleDates[driveId] || undefined,
      });
      setMessage(
        action === "approve"
          ? "Drive scheduled for students"
          : action === "request_reschedule"
            ? "Reschedule requested from company"
            : "Drive cancelled"
      );
      if (data.conflicts?.length) {
        setMessage(
          (action === "approve" ? "Scheduled with warnings: " : "Updated. Warnings: ") +
            data.conflicts.map((c) => c.message).join(" | ")
        );
      }
      await load();
    } catch (err) {
      setMessage(err.response?.data?.error || "Scheduling action failed");
    }
  };

  const addBlockedDate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/placement/blocked-dates", blockForm);
      setBlockForm({ title: "", start_date: "", end_date: "", reason: "" });
      setMessage("Blocked/exam period added");
      await load();
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not add blocked date");
    }
  };

  const removeBlockedDate = async (id) => {
    await api.delete(`/placement/blocked-dates/${id}`);
    setMessage("Blocked period removed");
    await load();
  };

  const s = report.summary;
  const q = studentQuery.trim().toLowerCase();
  const filteredStudents = students.filter((student) => {
    if (!q) return true;
    return [student.full_name, student.email, student.branch]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
  const pendingSchedule = drives.filter((d) =>
    ["proposed", "needs_reschedule"].includes(d.status)
  );

  const tabs = [
    { id: "reports", label: "Reports" },
    { id: "scheduling", label: "Scheduling", count: pendingSchedule.length },
    { id: "calendar", label: "Exam calendar", count: blockedDates.length },
    { id: "students", label: "Students", count: students.length },
    { id: "companies", label: "Companies", count: pending.length },
    { id: "drives", label: "Drives", count: drives.length },
    { id: "announcements", label: "Announcements", count: announcements.length },
  ];

  return (
    <div className="dashboard dash-shell">
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">Placement control room</p>
          <h2>Campus operations</h2>
          <p className="muted">Approve companies, guide students, and track hiring outcomes</p>
        </div>
        <div className="dash-quick-stats">
          <div className="mini-stat">
            <span>Students</span>
            <strong>{s.students}</strong>
          </div>
          <div className="mini-stat">
            <span>Pending</span>
            <strong>{s.companies_pending}</strong>
          </div>
          <div className="mini-stat">
            <span>Selected</span>
            <strong>{report.by_status.selected}</strong>
          </div>
        </div>
      </header>

      {message && <div className="toast-banner is-ok">{message}</div>}

      <DashboardTabs tabs={tabs} active={tab} onChange={setTab} />

      <section className="tab-panel" key={tab}>
        {tab === "scheduling" && (
          <>
            <div className="panel-head">
              <h3>Drive scheduling</h3>
              <p className="muted">
                Coordinate dates with companies. Conflict checks cover other drives and exam blocks.
              </p>
            </div>
            <div className="card-list">
              {drives.map((drive) => (
                <article key={drive.id} className="soft-card">
                  <div className="row-card" style={{ padding: 0, border: "none" }}>
                    <div>
                      <strong>{drive.title}</strong>
                      <p className="muted">
                        {drive.company_name} · Preferred: {drive.drive_date || "TBA"} · Branches:{" "}
                        {drive.eligible_branches || "All"}
                      </p>
                      {drive.alternate_dates && (
                        <p className="muted">Alternates: {drive.alternate_dates}</p>
                      )}
                      {drive.placement_note && (
                        <p className="warn-note">Note: {drive.placement_note}</p>
                      )}
                    </div>
                    <span className={`status-pill status-${drive.status}`}>{drive.status}</span>
                  </div>

                  {!!drive.conflicts?.length && (
                    <div className="conflict-box">
                      {drive.conflicts.map((c, idx) => (
                        <p key={idx} className={c.severity === "high" ? "error" : "muted"}>
                          ⚠ {c.message}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="grid-form" style={{ marginTop: "0.8rem" }}>
                    <label>
                      Confirm / suggest date
                      <input
                        type="date"
                        value={scheduleDates[drive.id] ?? drive.drive_date ?? ""}
                        onChange={(e) =>
                          setScheduleDates({ ...scheduleDates, [drive.id]: e.target.value })
                        }
                      />
                    </label>
                    <label className="full">
                      Placement note
                      <input
                        value={scheduleNotes[drive.id] ?? ""}
                        onChange={(e) =>
                          setScheduleNotes({ ...scheduleNotes, [drive.id]: e.target.value })
                        }
                        placeholder="Exam week / clash with Infosys drive..."
                      />
                    </label>
                  </div>
                  <div className="cta-row" style={{ marginTop: "0.75rem" }}>
                    <button
                      className="btn primary"
                      onClick={() => scheduleAction(drive.id, "approve")}
                    >
                      Approve & schedule
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => scheduleAction(drive.id, "request_reschedule")}
                    >
                      Request reschedule
                    </button>
                    <button
                      className="btn ghost"
                      onClick={() => scheduleAction(drive.id, "cancel")}
                    >
                      Cancel
                    </button>
                  </div>
                </article>
              ))}
              {!drives.length && <p className="muted empty-note">No drives to schedule.</p>}
            </div>
          </>
        )}

        {tab === "calendar" && (
          <>
            <div className="panel-head">
              <h3>Exam / blocked calendar</h3>
              <p className="muted">Mark periods when drives should not be scheduled</p>
            </div>
            <form className="grid-form surface-form" onSubmit={addBlockedDate}>
              <label>
                Title
                <input
                  value={blockForm.title}
                  onChange={(e) => setBlockForm({ ...blockForm, title: e.target.value })}
                  placeholder="Mid-sem exams"
                  required
                />
              </label>
              <label>
                Reason
                <input
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  placeholder="CSE/IT midterms"
                />
              </label>
              <label>
                Start date
                <input
                  type="date"
                  value={blockForm.start_date}
                  onChange={(e) => setBlockForm({ ...blockForm, start_date: e.target.value })}
                  required
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={blockForm.end_date}
                  onChange={(e) => setBlockForm({ ...blockForm, end_date: e.target.value })}
                  required
                />
              </label>
              <button className="btn primary" type="submit">
                Add blocked period
              </button>
            </form>
            <div className="card-list" style={{ marginTop: "1rem" }}>
              {blockedDates.map((b) => (
                <article key={b.id} className="soft-card row-card">
                  <div>
                    <strong>{b.title}</strong>
                    <p className="muted">
                      {b.start_date} → {b.end_date}
                      {b.reason ? ` · ${b.reason}` : ""}
                    </p>
                  </div>
                  <button className="btn ghost" onClick={() => removeBlockedDate(b.id)}>
                    Remove
                  </button>
                </article>
              ))}
              {!blockedDates.length && (
                <p className="muted empty-note">No blocked periods yet.</p>
              )}
            </div>
          </>
        )}

        {tab === "reports" && (
          <>
            <div className="panel-head">
              <h3>Placement reports</h3>
              <p className="muted">Live snapshot of portal activity</p>
            </div>
            <div className="stat-grid">
              <article className="stat-card">
                <p className="stat-label">Students</p>
                <p className="stat-value">{s.students}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">Companies</p>
                <p className="stat-value">{s.companies_approved}</p>
                <p className="muted">{s.companies_pending} pending</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">Active drives</p>
                <p className="stat-value">{s.drives_active}</p>
                <p className="muted">{s.drives_total} total</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">Applications</p>
                <p className="stat-value">{s.applications_total}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">Selected</p>
                <p className="stat-value">{report.by_status.selected}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">Selection rate</p>
                <p className="stat-value">{s.selection_rate_percent}%</p>
              </article>
            </div>

            <div className="report-split">
              <div className="soft-card">
                <h4>Applications by status</h4>
                <div className="list compact">
                  {Object.entries(report.by_status).map(([status, count]) => (
                    <article key={status} className="item">
                      <strong style={{ textTransform: "capitalize" }}>{status}</strong>
                      <span>{count}</span>
                    </article>
                  ))}
                </div>
              </div>
              <div className="soft-card">
                <h4>Applications by branch</h4>
                <div className="list compact">
                  {report.by_branch.map((row) => (
                    <article key={row.branch} className="item">
                      <strong>{row.branch}</strong>
                      <span>{row.applications}</span>
                    </article>
                  ))}
                  {!report.by_branch.length && <p className="muted">No applications yet.</p>}
                </div>
              </div>
            </div>

            <h4>Company-wise report</h4>
            <div className="table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Drives</th>
                    <th>Applicants</th>
                    <th>Selected</th>
                  </tr>
                </thead>
                <tbody>
                  {report.by_company.map((row) => (
                    <tr key={row.company_id}>
                      <td>{row.company_name}</td>
                      <td>{row.drives}</td>
                      <td>{row.applicants}</td>
                      <td>{row.selected}</td>
                    </tr>
                  ))}
                  {!report.by_company.length && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No companies yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "students" && (
          <>
            <div className="panel-head">
              <h3>Registered students</h3>
              <p className="muted">Open a student only when you need full details</p>
            </div>
            <label className="full search-field">
              Search students
              <input
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Name, email, branch"
              />
            </label>
            <div className="card-list">
              {filteredStudents.map((student) => (
                <article key={student.id} className="soft-card row-card">
                  <div>
                    <strong>{student.full_name}</strong>
                    <p className="muted">
                      {student.email}
                      {student.branch ? ` · ${student.branch}` : ""} · {student.applications_count}{" "}
                      apps
                    </p>
                  </div>
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => openStudent(student.id)}
                  >
                    View / Edit
                  </button>
                </article>
              ))}
              {!filteredStudents.length && (
                <p className="muted empty-note">No registered students found.</p>
              )}
            </div>
          </>
        )}

        {tab === "companies" && (
          <>
            <div className="panel-head">
              <h3>Pending company approvals</h3>
              <p className="muted">Approve hiring partners before they post drives</p>
            </div>
            <div className="card-list">
              {pending.map((c) => (
                <article key={c.id} className="soft-card row-card">
                  <div>
                    <strong>{c.company_name}</strong>
                    <p className="muted">{c.email}</p>
                  </div>
                  <button className="btn primary" onClick={() => approve(c.id)}>
                    Approve
                  </button>
                </article>
              ))}
              {!pending.length && <p className="muted empty-note">No pending companies.</p>}
            </div>
          </>
        )}

        {tab === "drives" && (
          <>
            <div className="panel-head">
              <h3>All drives</h3>
              <p className="muted">Campus-wide hiring calendar with schedule status</p>
            </div>
            <div className="card-list">
              {drives.map((drive) => (
                <article key={drive.id} className="soft-card row-card">
                  <div>
                    <strong>{drive.title}</strong>
                    <p className="muted">
                      {drive.company_name} · {drive.drive_date || "TBA"} · {drive.package_lpa || "-"}{" "}
                      LPA
                    </p>
                  </div>
                  <span className={`status-pill status-${drive.status}`}>{drive.status}</span>
                </article>
              ))}
              {!drives.length && <p className="muted empty-note">No drives yet.</p>}
            </div>
          </>
        )}

        {tab === "announcements" && (
          <>
            <div className="panel-head">
              <h3>Announcements</h3>
              <p className="muted">Messages visible on student dashboards</p>
            </div>
            <form className="grid-form surface-form" onSubmit={postAnnouncement}>
              <label className="full">
                Title
                <input
                  value={announcement.title}
                  onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
                  required
                />
              </label>
              <label className="full">
                Body
                <textarea
                  value={announcement.body}
                  onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })}
                  rows={3}
                  required
                />
              </label>
              <button className="btn primary" type="submit">
                Publish
              </button>
            </form>
            <div className="card-list" style={{ marginTop: "1rem" }}>
              {announcements.map((a) => (
                <article key={a.id} className="soft-card">
                  <strong>{a.title}</strong>
                  <p>{a.body}</p>
                </article>
              ))}
              {!announcements.length && (
                <p className="muted empty-note">No announcements posted yet.</p>
              )}
            </div>
          </>
        )}
      </section>

      {selectedStudent && editForm && (
        <div className="modal-backdrop" onClick={closeStudent}>
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Student details"
          >
            <div className="modal-header">
              <h3>Student details</h3>
              <button className="btn ghost" type="button" onClick={closeStudent}>
                Close
              </button>
            </div>

            <p className="muted">
              Applications: {selectedStudent.applications_count} · Selected:{" "}
              {selectedStudent.selected_count} · Resume:{" "}
              {selectedStudent.has_resume
                ? selectedStudent.resume_original_name || "Uploaded"
                : "Not uploaded"}
            </p>

            <form className="grid-form" onSubmit={saveStudent}>
              <label>
                Full name
                <input
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  required
                />
              </label>
              <label>
                Email
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  type="email"
                  required
                />
              </label>
              <label>
                Branch
                <input
                  value={editForm.branch}
                  onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                />
              </label>
              <label>
                Year
                <input
                  value={editForm.year}
                  onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                  type="number"
                />
              </label>
              <label>
                CGPA
                <input
                  value={editForm.cgpa}
                  onChange={(e) => setEditForm({ ...editForm, cgpa: e.target.value })}
                  type="number"
                  step="0.01"
                />
              </label>
              <label>
                Phone
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </label>

              {detailError && <p className="error full">{detailError}</p>}

              <div className="cta-row full">
                <button className="btn primary" type="submit" disabled={savingStudent}>
                  {savingStudent ? "Saving…" : "Save changes"}
                </button>
                {selectedStudent.has_resume && (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() =>
                      downloadPdf(
                        `/students/${selectedStudent.id}/resume`,
                        selectedStudent.resume_original_name ||
                          `${selectedStudent.full_name || "student"}_resume.pdf`
                      ).catch(() => setDetailError("Could not download resume"))
                    }
                  >
                    Download resume
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
