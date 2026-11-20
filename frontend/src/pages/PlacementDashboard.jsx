import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { downloadPdf } from "../downloadResume";
import DashboardTabs from "../components/DashboardTabs";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import MonthCalendar from "../components/MonthCalendar";
import StatusPill from "../components/StatusPill";
import { COURSES, SEMESTERS } from "../constants/courses";
import { DRIVE_ROUNDS, roundLabel } from "../constants/rounds";
import { formatDriveWhen } from "../utils/driveWhen";
import { driveStatusLabel } from "../utils/statusLabels";

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
    in_round: 0,
    waitlisted: 0,
    selected: 0,
    rejected: 0,
  },
  by_company: [],
  by_branch: [],
};

export default function PlacementDashboard() {
  const [tab, setTab] = useState("reports");
  const [pending, setPending] = useState([]);
  const [approvedCompanies, setApprovedCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [drives, setDrives] = useState([]);
  const [report, setReport] = useState(emptyReport);
  const [announcement, setAnnouncement] = useState({ title: "", body: "" });
  const [announcements, setAnnouncements] = useState([]);
  const [message, setMessage] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [savingStudent, setSavingStudent] = useState(false);
  const [resumePreviewUrl, setResumePreviewUrl] = useState(null);
  const [blockedDates, setBlockedDates] = useState([]);
  const [blockForm, setBlockForm] = useState({
    title: "",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [scheduleNotes, setScheduleNotes] = useState({});
  const [scheduleDates, setScheduleDates] = useState({});
  const [scheduleTimes, setScheduleTimes] = useState({});
  const [calendarDay, setCalendarDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [driveQuery, setDriveQuery] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");

  const load = async () => {
    const [p, approved, d, a, r, st, b] = await Promise.all([
      api.get("/placement/companies/pending"),
      api.get("/placement/companies/approved"),
      api.get("/drives"),
      api.get("/placement/announcements"),
      api.get("/placement/reports"),
      api.get("/placement/students"),
      api.get("/placement/blocked-dates"),
    ]);
    setPending(p.data);
    setApprovedCompanies(approved.data);
    setDrives(d.data);
    setAnnouncements(a.data);
    setReport(r.data);
    setStudents(st.data);
    setBlockedDates(b.data);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => setMessage("Could not load placement data"))
      .finally(() => setLoading(false));
  }, []);

  const approve = async (companyId) => {
    await api.post(`/placement/companies/${companyId}/approve`);
    setMessage("Company approved");
    if (selectedCompany?.id === companyId) {
      await openCompany(companyId);
    }
    await load();
  };

  const setDriveRound = async (driveId, current_round) => {
    try {
      await api.patch(`/drives/${driveId}`, { current_round });
      setMessage(`Drive round set to ${roundLabel(current_round)}`);
      await load();
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not update drive round");
    }
  };

  const openCompany = async (companyId) => {
    setCompanyLoading(true);
    try {
      const { data } = await api.get(`/placement/companies/${companyId}`);
      setSelectedCompany(data);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not load company details");
    } finally {
      setCompanyLoading(false);
    }
  };

  const closeCompany = () => setSelectedCompany(null);

  const postAnnouncement = async (e) => {
    e.preventDefault();
    await api.post("/placement/announcements", announcement);
    setAnnouncement({ title: "", body: "" });
    setMessage("Announcement posted");
    await load();
  };

  const clearResumePreview = () => {
    setResumePreviewUrl((prev) => {
      if (prev) window.URL.revokeObjectURL(prev);
      return null;
    });
  };

  const loadResumePreview = async (studentId, hasResume) => {
    clearResumePreview();
    if (!hasResume) return;
    try {
      const response = await api.get(`/students/${studentId}/resume`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      setResumePreviewUrl((prev) => {
        if (prev) window.URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      clearResumePreview();
      setDetailError("Could not load resume preview");
    }
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
        semester: data.semester ?? "",
        cgpa: data.cgpa ?? "",
        phone: data.phone || "",
      });
      await loadResumePreview(studentId, data.has_resume);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not load student details");
    }
  };

  const closeStudent = () => {
    clearResumePreview();
    setSelectedStudent(null);
    setEditForm(null);
    setDetailError("");
  };

  const saveStudent = async (e) => {
    e.preventDefault();
    if (!selectedStudent) return;
    const cgpaNum = editForm.cgpa === "" ? null : Number(editForm.cgpa);
    if (cgpaNum !== null && (cgpaNum < 0 || cgpaNum > 10)) {
      setDetailError("CGPA must be between 0 and 10");
      return;
    }
    setSavingStudent(true);
    setDetailError("");
    try {
      const { data } = await api.patch(`/placement/students/${selectedStudent.id}`, {
        ...editForm,
        semester: editForm.semester === "" ? null : Number(editForm.semester),
        cgpa: cgpaNum,
      });
      setSelectedStudent(data);
      setEditForm({
        full_name: data.full_name || "",
        email: data.email || "",
        branch: data.branch || "",
        semester: data.semester ?? "",
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
      const drive = drives.find((d) => d.id === driveId);
      const { data } = await api.post(`/drives/${driveId}/schedule`, {
        action,
        placement_note:
          scheduleNotes[driveId] !== undefined
            ? scheduleNotes[driveId]
            : drive?.placement_note || "",
        drive_date: scheduleDates[driveId] || drive?.drive_date || undefined,
        drive_time:
          scheduleTimes[driveId] !== undefined
            ? scheduleTimes[driveId] || null
            : drive?.drive_time || undefined,
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

  const branchKey = (branch) => {
    const trimmed = (branch || "").trim();
    return trimmed ? trimmed.toUpperCase() : "Unassigned";
  };

  const branchGroups = useMemo(() => {
    const map = new Map();
    students.forEach((student) => {
      const key = branchKey(student.branch);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(student);
    });
    return Array.from(map.entries())
      .map(([branch, list]) => ({
        branch,
        count: list.length,
        withResume: list.filter((item) => item.has_resume).length,
      }))
      .sort((a, b) => a.branch.localeCompare(b.branch));
  }, [students]);

  const filteredStudents = students.filter((student) => {
    if (selectedBranch) {
      if (branchKey(student.branch) !== selectedBranch) return false;
    }
    if (!q) return true;
    return [student.full_name, student.email, student.branch]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
  const pendingSchedule = drives.filter((d) =>
    ["proposed", "needs_reschedule"].includes(d.status)
  );
  const driveQ = driveQuery.trim().toLowerCase();
  const filteredDrives = drives.filter((drive) => {
    if (!driveQ) return true;
    return [
      drive.title,
      drive.company_name,
      drive.role,
      drive.status,
      drive.current_round_label,
      drive.eligible_branches,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(driveQ));
  });
  const companyQ = companyQuery.trim().toLowerCase();
  const filteredPending = pending.filter((c) => {
    if (!companyQ) return true;
    return [c.company_name, c.email, c.website]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(companyQ));
  });
  const filteredApproved = approvedCompanies.filter((c) => {
    if (!companyQ) return true;
    return [c.company_name, c.email, c.website, c.hr_contact]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(companyQ));
  });

  const markedDriveDates = useMemo(() => {
    const map = {};
    drives.forEach((drive) => {
      if (!drive.drive_date || drive.status === "cancelled") return;
      map[drive.drive_date] = (map[drive.drive_date] || 0) + 1;
    });
    return map;
  }, [drives]);

  const drivesOnCalendarDay = useMemo(() => {
    if (!calendarDay) return [];
    return drives
      .filter((d) => d.drive_date === calendarDay && d.status !== "cancelled")
      .sort((a, b) => String(a.drive_time || "").localeCompare(String(b.drive_time || "")));
  }, [drives, calendarDay]);

  const tabs = [
    { id: "reports", label: "Reports" },
    { id: "scheduling", label: "Scheduling", count: pendingSchedule.length },
    { id: "calendar", label: "Calendar" },
    { id: "students", label: "Students", count: students.length },
    {
      id: "companies",
      label: "Companies",
      count: pending.length + approvedCompanies.length,
    },
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

      {loading ? (
        <section className="tab-panel">
          <LoadingSkeleton rows={5} />
        </section>
      ) : (
      <section className="tab-panel" key={tab}>
        {tab === "scheduling" && (
          <>
            <div className="panel-head">
              <h3>Drive scheduling</h3>
              <p className="muted">Edit slot → Approve / Reschedule / Cancel</p>
            </div>
            <label className="full search-field">
              Search drives
              <input
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                placeholder="Company, title, round, or status"
              />
            </label>
            <div className="table-wrap sheet-wrap sheet-desktop">
              <table className="report-table sheet-table sheet-compact">
                <thead>
                  <tr>
                    <th className="sheet-sticky-col">Company / Drive</th>
                    <th>Branches</th>
                    <th>Status</th>
                    <th>Round</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Note</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrives.map((drive) => {
                    const conflictCount = drive.conflicts?.length || 0;
                    const hasHigh = (drive.conflicts || []).some((c) => c.severity === "high");
                    return (
                      <tr key={drive.id}>
                        <td className="sheet-sticky-col">
                          <strong>{drive.company_name || "—"}</strong>
                          <div className="sheet-sub">
                            {drive.title}
                            {drive.role ? ` · ${drive.role}` : ""}
                            {drive.package_lpa != null ? ` · ${drive.package_lpa} LPA` : ""}
                          </div>
                          {drive.alternate_dates && (
                            <div className="sheet-sub">Alt: {drive.alternate_dates}</div>
                          )}
                        </td>
                        <td>{drive.eligible_branches || "All"}</td>
                        <td>
                          <StatusPill status={drive.status} />
                          {conflictCount > 0 && (
                            <div
                              className={hasHigh ? "error sheet-conflict" : "muted sheet-conflict"}
                              title={(drive.conflicts || []).map((c) => c.message).join("\n")}
                            >
                              {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
                            </div>
                          )}
                        </td>
                        <td>
                          <select
                            className="sheet-input"
                            value={drive.current_round || "registration"}
                            onChange={(e) => setDriveRound(drive.id, e.target.value)}
                          >
                            {DRIVE_ROUNDS.map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="sheet-input"
                            type="date"
                            value={scheduleDates[drive.id] ?? drive.drive_date ?? ""}
                            onChange={(e) =>
                              setScheduleDates({
                                ...scheduleDates,
                                [drive.id]: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="sheet-input sheet-input-time"
                            type="time"
                            value={scheduleTimes[drive.id] ?? drive.drive_time ?? ""}
                            onChange={(e) =>
                              setScheduleTimes({
                                ...scheduleTimes,
                                [drive.id]: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="sheet-note-cell">
                          <input
                            className="sheet-input sheet-input-wide"
                            value={scheduleNotes[drive.id] ?? drive.placement_note ?? ""}
                            onChange={(e) =>
                              setScheduleNotes({
                                ...scheduleNotes,
                                [drive.id]: e.target.value,
                              })
                            }
                            placeholder="Note…"
                          />
                        </td>
                        <td>
                          <div className="sheet-actions sheet-actions-row">
                            <button
                              className="btn primary"
                              type="button"
                              onClick={() => scheduleAction(drive.id, "approve")}
                            >
                              Approve
                            </button>
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() => scheduleAction(drive.id, "request_reschedule")}
                            >
                              Reschedule
                            </button>
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() => scheduleAction(drive.id, "cancel")}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredDrives.length && (
                    <tr>
                      <td colSpan={8} className="muted">
                        {drives.length ? "No matching drives." : "No drives to schedule."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="sheet-mobile-cards">
              {filteredDrives.map((drive) => (
                <article key={`m-${drive.id}`} className="soft-card sheet-mobile-card">
                  <div className="row-card" style={{ padding: 0, border: "none" }}>
                    <div>
                      <strong>{drive.company_name || "Company"}</strong>
                      <p className="muted">{drive.title}</p>
                    </div>
                    <StatusPill status={drive.status} />
                  </div>
                  <label className="full" style={{ marginTop: "0.5rem" }}>
                    Round
                    <select
                      value={drive.current_round || "registration"}
                      onChange={(e) => setDriveRound(drive.id, e.target.value)}
                    >
                      {DRIVE_ROUNDS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid-form compact-form" style={{ marginTop: "0.45rem" }}>
                    <label>
                      Date
                      <input
                        type="date"
                        value={scheduleDates[drive.id] ?? drive.drive_date ?? ""}
                        onChange={(e) =>
                          setScheduleDates({ ...scheduleDates, [drive.id]: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Time
                      <input
                        type="time"
                        value={scheduleTimes[drive.id] ?? drive.drive_time ?? ""}
                        onChange={(e) =>
                          setScheduleTimes({ ...scheduleTimes, [drive.id]: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="full" style={{ marginTop: "0.45rem" }}>
                    Note
                    <input
                      value={scheduleNotes[drive.id] ?? drive.placement_note ?? ""}
                      onChange={(e) =>
                        setScheduleNotes({ ...scheduleNotes, [drive.id]: e.target.value })
                      }
                      placeholder="Note…"
                    />
                  </label>
                  <div className="sheet-actions-row" style={{ marginTop: "0.55rem" }}>
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => scheduleAction(drive.id, "approve")}
                    >
                      Approve
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => scheduleAction(drive.id, "request_reschedule")}
                    >
                      Reschedule
                    </button>
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => scheduleAction(drive.id, "cancel")}
                    >
                      Cancel
                    </button>
                  </div>
                </article>
              ))}
              {!filteredDrives.length && (
                <EmptyState
                  title={drives.length ? "No matching drives" : "No drives to schedule"}
                  message={
                    drives.length
                      ? "Try another search term."
                      : "When companies propose drives, they will appear here for approval."
                  }
                  actionLabel={drives.length ? "Clear search" : undefined}
                  onAction={drives.length ? () => setDriveQuery("") : undefined}
                />
              )}
            </div>
          </>
        )}

        {tab === "calendar" && (
          <>
            <div className="panel-head">
              <h3>Drive calendar</h3>
              <p className="muted">Days with drives are marked — tap a day to see the schedule</p>
            </div>
            <div className="calendar-layout">
              <MonthCalendar
                markedDates={markedDriveDates}
                selectedDate={calendarDay}
                onSelectDate={setCalendarDay}
              />
              <div className="calendar-day-panel">
                <h4>{calendarDay ? `Drives on ${calendarDay}` : "Select a day"}</h4>
                {calendarDay && (
                  <div className="card-list">
                    {drivesOnCalendarDay.map((drive) => (
                      <article key={drive.id} className="soft-card">
                        <strong>{drive.title}</strong>
                        <p className="muted">
                          {drive.company_name} · {drive.drive_time || "Time TBA"} ·{" "}
                          {driveStatusLabel(drive.status)}
                        </p>
                        <p className="muted">Branches: {drive.eligible_branches || "All"}</p>
                      </article>
                    ))}
                    {!drivesOnCalendarDay.length && (
                      <p className="muted empty-note">No drives on this date.</p>
                    )}
                  </div>
                )}
                {!calendarDay && (
                  <p className="muted">Marked dates have one or more company drives.</p>
                )}
              </div>
            </div>

            <div className="panel-head" style={{ marginTop: "1.6rem" }}>
              <h3>Exam / blocked periods</h3>
              <p className="muted">Mark windows when drives should not be scheduled</p>
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
              <div>
                <h3>
                  {selectedBranch
                    ? `${selectedBranch} students`
                    : "Students by branch"}
                </h3>
                <p className="muted">
                  {selectedBranch
                    ? "Tap a student name to preview their resume"
                    : "Choose a branch to browse its students"}
                </p>
              </div>
              {selectedBranch && (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setSelectedBranch(null);
                    setStudentQuery("");
                  }}
                >
                  All branches
                </button>
              )}
            </div>

            {!selectedBranch ? (
              <div className="branch-grid">
                {branchGroups.map((group) => (
                  <button
                    key={group.branch}
                    type="button"
                    className="branch-tile"
                    onClick={() => {
                      setSelectedBranch(group.branch);
                      setStudentQuery("");
                    }}
                  >
                    <strong>{group.branch}</strong>
                    <span>
                      {group.count} student{group.count === 1 ? "" : "s"}
                    </span>
                    <span className="muted">
                      {group.withResume} resume{group.withResume === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
                {!branchGroups.length && (
                  <p className="muted empty-note">No registered students found.</p>
                )}
              </div>
            ) : (
              <>
                <label className="full search-field">
                  Search in {selectedBranch}
                  <input
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Name or email"
                  />
                </label>
                <div className="card-list">
                  {filteredStudents.map((student) => (
                    <article key={student.id} className="soft-card row-card">
                      <button
                        type="button"
                        className="student-name-btn"
                        onClick={() => openStudent(student.id)}
                      >
                        <strong>{student.full_name}</strong>
                        <p className="muted">
                          {student.email} · {student.applications_count} apps
                          {student.has_resume ? " · Resume ready" : " · No resume"}
                        </p>
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => openStudent(student.id)}
                      >
                        Preview
                      </button>
                    </article>
                  ))}
                  {!filteredStudents.length && (
                    <p className="muted empty-note">No students in this branch.</p>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {tab === "companies" && (
          <>
            <div className="panel-head">
              <h3>Companies</h3>
              <p className="muted">Approve new partners and track who already has access</p>
            </div>
            <label className="full search-field">
              Search companies
              <input
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                placeholder="Name, email, website, or HR contact"
              />
            </label>

            <h4 className="section-label">Pending approval</h4>
            <div className="card-list">
              {filteredPending.map((c) => (
                <article key={c.id} className="soft-card row-card">
                  <button
                    type="button"
                    className="student-name-btn"
                    onClick={() => openCompany(c.id)}
                  >
                    <strong>{c.company_name}</strong>
                    <p className="muted">
                      {c.email}
                      {c.website ? ` · ${c.website}` : ""}
                    </p>
                  </button>
                  <div className="cta-row">
                    <button className="btn ghost" type="button" onClick={() => openCompany(c.id)}>
                      View
                    </button>
                    <button className="btn primary" type="button" onClick={() => approve(c.id)}>
                      Approve
                    </button>
                  </div>
                </article>
              ))}
              {!filteredPending.length && (
                <p className="muted empty-note">
                  {pending.length ? "No matching pending companies." : "No pending companies."}
                </p>
              )}
            </div>

            <h4 className="section-label" style={{ marginTop: "1.4rem" }}>
              Approved companies ({filteredApproved.length}
              {companyQ ? ` of ${approvedCompanies.length}` : ""})
            </h4>
            <div className="table-wrap sheet-wrap">
              <table className="report-table sheet-table sheet-compact">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Email</th>
                    <th>Website</th>
                    <th>HR contact</th>
                    <th>Drives</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApproved.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <button
                          type="button"
                          className="student-name-btn"
                          onClick={() => openCompany(c.id)}
                        >
                          <strong>{c.company_name}</strong>
                        </button>
                      </td>
                      <td>{c.email || "—"}</td>
                      <td>{c.website || "—"}</td>
                      <td>{c.hr_contact || "—"}</td>
                      <td>{c.drives_count ?? 0}</td>
                      <td>
                        <span className="status-pill status-scheduled">approved</span>
                      </td>
                      <td>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => openCompany(c.id)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filteredApproved.length && (
                    <tr>
                      <td colSpan={7} className="muted">
                        {approvedCompanies.length
                          ? "No matching approved companies."
                          : "No approved companies yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "drives" && (
          <>
            <div className="panel-head">
              <h3>All drives</h3>
              <p className="muted">
                Overview sheet — use Scheduling to approve, reschedule, or cancel
              </p>
            </div>
            <label className="full search-field">
              Search drives
              <input
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                placeholder="Company, title, round, or status"
              />
            </label>
            <div className="table-wrap sheet-wrap">
              <table className="report-table sheet-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Drive</th>
                    <th>Role</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Round</th>
                    <th>Branches</th>
                    <th>Package</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrives.map((drive) => (
                    <tr key={drive.id}>
                      <td>{drive.company_name || "—"}</td>
                      <td>
                        <strong>{drive.title}</strong>
                      </td>
                      <td>{drive.role || "—"}</td>
                      <td>{drive.drive_date || "TBA"}</td>
                      <td>{drive.drive_time || "—"}</td>
                      <td>
                        <select
                          className="sheet-input"
                          value={drive.current_round || "registration"}
                          onChange={(e) => setDriveRound(drive.id, e.target.value)}
                        >
                          {DRIVE_ROUNDS.map((r) => (
                            <option key={r.key} value={r.key}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{drive.eligible_branches || "All"}</td>
                      <td>{drive.package_lpa != null ? `${drive.package_lpa} LPA` : "—"}</td>
                      <td>
                        <StatusPill status={drive.status} />
                      </td>
                    </tr>
                  ))}
                  {!filteredDrives.length && (
                    <tr>
                      <td colSpan={9} className="muted">
                        {drives.length ? "No matching drives." : "No drives yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
      )}

      {selectedCompany && (
        <div className="modal-backdrop" onClick={closeCompany}>
          <div
            className="modal-panel modal-compact"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Company details"
          >
            <div className="modal-header modal-header-compact">
              <div>
                <h3>{selectedCompany.company_name}</h3>
                <p className="muted compact-meta">
                  <span
                    className={`status-pill status-${
                      selectedCompany.is_approved ? "scheduled" : "proposed"
                    }`}
                  >
                    {selectedCompany.is_approved ? "approved" : "pending"}
                  </span>
                  {selectedCompany.registered_at
                    ? ` · ${selectedCompany.registered_at.slice(0, 10)}`
                    : ""}
                  {` · ${selectedCompany.drives_count ?? 0} drives`}
                </p>
              </div>
              <button className="btn ghost" type="button" onClick={closeCompany}>
                Close
              </button>
            </div>

            {companyLoading ? (
              <p className="muted">Loading…</p>
            ) : (
              <>
                <table className="compact-kv">
                  <tbody>
                    <tr>
                      <th>Email</th>
                      <td>{selectedCompany.email || "—"}</td>
                    </tr>
                    <tr>
                      <th>Website</th>
                      <td>
                        {selectedCompany.website ? (
                          <a
                            href={
                              selectedCompany.website.startsWith("http")
                                ? selectedCompany.website
                                : `https://${selectedCompany.website}`
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            {selectedCompany.website}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    <tr>
                      <th>HR</th>
                      <td>{selectedCompany.hr_contact || "—"}</td>
                    </tr>
                    <tr>
                      <th>About</th>
                      <td>{selectedCompany.description || "—"}</td>
                    </tr>
                  </tbody>
                </table>

                <p className="section-label" style={{ marginTop: "0.75rem" }}>
                  Drives
                </p>
                <div className="table-wrap sheet-wrap">
                  <table className="report-table sheet-table sheet-compact">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>When</th>
                        <th>Role</th>
                        <th>Pkg</th>
                        <th>Branches</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCompany.drives || []).map((drive) => (
                        <tr key={drive.id}>
                          <td>{drive.title}</td>
                          <td>{formatDriveWhen(drive)}</td>
                          <td>{drive.role || "—"}</td>
                          <td>{drive.package_lpa != null ? drive.package_lpa : "—"}</td>
                          <td>{drive.eligible_branches || "All"}</td>
                          <td>
                            <span className={`status-pill status-${drive.status}`}>
                              {drive.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!selectedCompany.drives?.length && (
                        <tr>
                          <td colSpan={6} className="muted">
                            No drives yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {!selectedCompany.is_approved && (
                  <div className="cta-row" style={{ marginTop: "0.75rem" }}>
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() => approve(selectedCompany.id)}
                    >
                      Approve
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {selectedStudent && editForm && (
        <div className="modal-backdrop" onClick={closeStudent}>
          <div
            className="modal-panel modal-panel-wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Student resume preview"
          >
            <div className="modal-header">
              <h3>{selectedStudent.full_name}</h3>
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

            <div className="resume-preview-box">
              {resumePreviewUrl ? (
                <iframe
                  title="Resume preview"
                  src={resumePreviewUrl}
                  className="resume-iframe"
                />
              ) : (
                <p className="muted empty-note">
                  {selectedStudent.has_resume
                    ? "Loading resume preview…"
                    : "No resume uploaded for this student."}
                </p>
              )}
            </div>

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
                Course / Branch
                <select
                  value={editForm.branch}
                  onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                >
                  <option value="">Select course</option>
                  {COURSES.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                  {editForm.branch && !COURSES.includes(editForm.branch) && (
                    <option value={editForm.branch}>{editForm.branch}</option>
                  )}
                </select>
              </label>
              <label>
                Semester
                <select
                  value={editForm.semester}
                  onChange={(e) => setEditForm({ ...editForm, semester: e.target.value })}
                >
                  <option value="">Select semester</option>
                  {SEMESTERS.map((sem) => (
                    <option key={sem} value={sem}>
                      Semester {sem}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                CGPA
                <input
                  value={editForm.cgpa}
                  onChange={(e) => setEditForm({ ...editForm, cgpa: e.target.value })}
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
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
