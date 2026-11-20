import { useEffect, useMemo, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { downloadPdf } from "../downloadResume";
import DashboardTabs from "../components/DashboardTabs";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import MonthCalendar from "../components/MonthCalendar";
import StatusPill from "../components/StatusPill";
import { APP_STATUSES, DRIVE_ROUNDS, roundLabel } from "../constants/rounds";
import { formatDriveWhen } from "../utils/driveWhen";
import { driveStatusLabel } from "../utils/statusLabels";

const emptyDrive = {
  title: "",
  role: "",
  package_lpa: "",
  location: "",
  drive_date: "",
  drive_time: "",
  deadline: "",
  alternate_dates: "",
  min_cgpa: "6.5",
  eligible_branches: "CSE,IT,ECE",
  description: "",
};

export default function CompanyDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("drives");
  const [drives, setDrives] = useState([]);
  const [form, setForm] = useState(emptyDrive);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [message, setMessage] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [offerFiles, setOfferFiles] = useState({});
  const [campusDrives, setCampusDrives] = useState([]);
  const [blockedDates, setBlockedDates] = useState([]);
  const [calendarDay, setCalendarDay] = useState(null);
  const [roundForms, setRoundForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [driveQuery, setDriveQuery] = useState("");
  const [applicantQuery, setApplicantQuery] = useState("");

  const loadDrives = async () => {
    const { data } = await api.get("/drives");
    setDrives(data);
    const forms = {};
    data.forEach((drive) => {
      const info = drive.current_round_info || {};
      forms[drive.id] = {
        current_round: drive.current_round || "registration",
        date: info.date || "",
        time: info.time || "",
        venue: info.venue || "",
        meet_link: info.meet_link || "",
        notes: info.notes || "",
      };
    });
    setRoundForms(forms);
  };

  const loadCalendar = async () => {
    const { data } = await api.get("/drives/campus-calendar");
    setCampusDrives(data.drives || []);
    setBlockedDates(data.blocked_dates || []);
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDrives(), loadCalendar()])
      .catch(() => setMessage("Could not load company data"))
      .finally(() => setLoading(false));
  }, []);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const createDrive = async (e) => {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/drives", {
        ...form,
        package_lpa: form.package_lpa ? Number(form.package_lpa) : null,
        min_cgpa: form.min_cgpa ? Number(form.min_cgpa) : 0,
      });
      setForm(emptyDrive);
      setMessage("Drive proposed. Waiting for placement date/time approval.");
      await Promise.all([loadDrives(), loadCalendar()]);
      setTab("drives");
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not create drive");
    }
  };

  const proposeNewDate = async (driveId) => {
    if (!rescheduleDate) {
      setMessage("Pick a new date first");
      return;
    }
    try {
      await api.patch(`/drives/${driveId}`, {
        drive_date: rescheduleDate,
        drive_time: rescheduleTime || null,
      });
      setMessage("New date/time proposed to placement team");
      setRescheduleDate("");
      setRescheduleTime("");
      await Promise.all([loadDrives(), loadCalendar()]);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not update date");
    }
  };

  const viewApplicants = async (driveId) => {
    setSelectedDrive(driveId);
    const { data } = await api.get(`/applications/drive/${driveId}`);
    setApplicants(data);
    setTab("applicants");
  };

  const setStatus = async (applicationId, payload) => {
    try {
      await api.patch(
        `/applications/${applicationId}/status`,
        typeof payload === "string" ? { status: payload } : payload
      );
      await viewApplicants(selectedDrive);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not update applicant");
    }
  };

  const updateRoundForm = (driveId, key, value) => {
    setRoundForms((prev) => ({
      ...prev,
      [driveId]: { ...prev[driveId], [key]: value },
    }));
  };

  const changeRound = (drive, nextRound) => {
    setRoundForms((prev) => {
      const current = prev[drive.id] || {
        current_round: drive.current_round || "registration",
        date: "",
        time: "",
        venue: "",
        meet_link: "",
        notes: "",
      };
      const info = drive.round_details?.[nextRound] || {};
      return {
        ...prev,
        [drive.id]: {
          ...current,
          current_round: nextRound,
          // Prefer saved round details, else fall back to drive slot
          date: info.date || current.date || drive.drive_date || "",
          time: info.time || current.time || drive.drive_time || "",
          venue: info.venue || current.venue || "",
          meet_link: info.meet_link || current.meet_link || "",
          notes: info.notes || current.notes || "",
        },
      };
    });
  };

  const saveRound = async (driveId) => {
    const form = roundForms[driveId];
    if (!form) return;
    try {
      await api.patch(`/drives/${driveId}`, {
        current_round: form.current_round,
        round_detail: {
          round: form.current_round,
          date: form.date,
          time: form.time,
          venue: form.venue,
          meet_link: form.meet_link,
          notes: form.notes,
        },
      });
      setMessage(`Round updated to ${roundLabel(form.current_round)} (students notified)`);
      await Promise.all([loadDrives(), loadCalendar()]);
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not update round");
    }
  };

  const advanceIntoRound = async (driveId) => {
    try {
      const { data } = await api.post(`/drives/${driveId}/advance-round`);
      setMessage(data.message);
      if (selectedDrive === driveId) await viewApplicants(driveId);
      await loadDrives();
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not advance applicants");
    }
  };

  const uploadOffer = async (applicationId) => {
    const file = offerFiles[applicationId];
    if (!file) {
      setMessage("Choose an offer PDF first");
      return;
    }
    const formData = new FormData();
    formData.append("offer", file);
    try {
      await api.post(`/applications/${applicationId}/offer`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setMessage("Offer letter uploaded");
      await viewApplicants(selectedDrive);
    } catch (err) {
      setMessage(err.response?.data?.error || "Offer upload failed");
    }
  };

  const selectedTitle = drives.find((d) => d.id === selectedDrive)?.title;
  const driveQ = driveQuery.trim().toLowerCase();
  const visibleDrives = drives.filter((drive) => {
    if (!driveQ) return true;
    return [drive.title, drive.role, drive.status, drive.current_round_label]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(driveQ));
  });
  const applicantQ = applicantQuery.trim().toLowerCase();
  const visibleApplicants = applicants.filter((app) => {
    if (!applicantQ) return true;
    return [app.student?.full_name, app.student?.branch, app.status, app.status_label]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(applicantQ));
  });

  const markedDriveDates = useMemo(() => {
    const map = {};
    campusDrives.forEach((drive) => {
      if (!drive.drive_date) return;
      map[drive.drive_date] = (map[drive.drive_date] || 0) + 1;
    });
    return map;
  }, [campusDrives]);

  const mineDates = useMemo(() => {
    const map = {};
    campusDrives.forEach((drive) => {
      if (drive.is_mine && drive.drive_date) map[drive.drive_date] = true;
    });
    return map;
  }, [campusDrives]);

  const otherDates = useMemo(() => {
    const map = {};
    campusDrives.forEach((drive) => {
      if (!drive.is_mine && drive.drive_date) map[drive.drive_date] = true;
    });
    return map;
  }, [campusDrives]);

  const blockedDateMap = useMemo(() => {
    const map = {};
    const pad = (n) => String(n).padStart(2, "0");
    blockedDates.forEach((block) => {
      if (!block.start_date || !block.end_date) return;
      const start = new Date(`${block.start_date}T00:00:00`);
      const end = new Date(`${block.end_date}T00:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        map[iso] = true;
      }
    });
    return map;
  }, [blockedDates]);

  const drivesOnDay = useMemo(() => {
    if (!calendarDay) return [];
    return campusDrives.filter((d) => d.drive_date === calendarDay);
  }, [campusDrives, calendarDay]);

  const blocksOnDay = useMemo(() => {
    if (!calendarDay) return [];
    return blockedDates.filter(
      (b) => b.start_date <= calendarDay && b.end_date >= calendarDay
    );
  }, [blockedDates, calendarDay]);

  const tabs = [
    { id: "drives", label: "My drives", count: drives.length },
    { id: "calendar", label: "Calendar" },
    { id: "post", label: "Propose drive" },
    { id: "applicants", label: "Applicants", count: applicants.length },
  ];

  return (
    <div className="dashboard dash-shell">
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">Company workspace</p>
          <h2>Hiring desk</h2>
          <p className="muted">
            {user?.is_approved === false
              ? "Awaiting placement team approval."
              : `Signed in as ${user?.email}`}
          </p>
        </div>
        <div className="dash-quick-stats">
          <div className="mini-stat">
            <span>Drives</span>
            <strong>{drives.length}</strong>
          </div>
          <div className="mini-stat">
            <span>Status</span>
            <strong>{user?.is_approved === false ? "Pending" : "Approved"}</strong>
          </div>
        </div>
      </header>

      {message && <div className="toast-banner is-ok">{message}</div>}

      <DashboardTabs tabs={tabs} active={tab} onChange={setTab} />

      {loading ? (
        <section className="tab-panel">
          <LoadingSkeleton rows={4} />
        </section>
      ) : (
      <section className="tab-panel" key={tab}>
        {tab === "drives" && (
          <>
            <div className="panel-head">
              <h3>Your drives</h3>
              <p className="muted">
                You can post multiple drives on the same day with different times. Placement
                approves before students can apply.
              </p>
            </div>
            <label className="full search-field">
              Search drives
              <input
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                placeholder="Title, role, or status"
              />
            </label>
            <div className="card-list">
              {visibleDrives.map((drive) => {
                const rf = roundForms[drive.id] || {
                  current_round: drive.current_round || "registration",
                  date: "",
                  time: "",
                  venue: "",
                  meet_link: "",
                  notes: "",
                };
                return (
                  <article key={drive.id} className="soft-card">
                    <div className="row-card" style={{ padding: 0, border: "none" }}>
                      <div>
                        <strong>{drive.title}</strong>
                        <p className="muted">
                          {drive.role} · Preferred: {formatDriveWhen(drive)}
                        </p>
                        <p className="muted">
                          Current round:{" "}
                          <strong>{drive.current_round_label || roundLabel(drive.current_round)}</strong>
                        </p>
                        {drive.placement_note && (
                          <p className="warn-note">Placement note: {drive.placement_note}</p>
                        )}
                      </div>
                      <StatusPill status={drive.status} />
                    </div>

                    {drive.status === "needs_reschedule" && (
                      <div className="cta-row" style={{ marginTop: "0.6rem" }}>
                        <input
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                        />
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                        />
                        <button className="btn primary" onClick={() => proposeNewDate(drive.id)}>
                          Propose new slot
                        </button>
                      </div>
                    )}

                    {drive.status === "scheduled" && (
                      <div className="round-box">
                        <div className="grid-form compact-form">
                          <label>
                            Round
                            <select
                              value={rf.current_round}
                              onChange={(e) => changeRound(drive, e.target.value)}
                            >
                              {DRIVE_ROUNDS.map((r) => (
                                <option key={r.key} value={r.key}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Round date
                            <input
                              type="date"
                              value={rf.date}
                              onChange={(e) => updateRoundForm(drive.id, "date", e.target.value)}
                            />
                          </label>
                          <label>
                            Round time
                            <input
                              type="time"
                              value={rf.time}
                              onChange={(e) => updateRoundForm(drive.id, "time", e.target.value)}
                            />
                          </label>
                          <label>
                            Venue
                            <input
                              value={rf.venue}
                              onChange={(e) => updateRoundForm(drive.id, "venue", e.target.value)}
                              placeholder="Hall A / Online"
                            />
                          </label>
                          <label className="full">
                            Meet link
                            <input
                              value={rf.meet_link}
                              onChange={(e) =>
                                updateRoundForm(drive.id, "meet_link", e.target.value)
                              }
                              placeholder="https://..."
                            />
                          </label>
                        </div>
                        <div className="cta-row" style={{ marginTop: "0.55rem" }}>
                          <button
                            className="btn primary"
                            type="button"
                            onClick={() => saveRound(drive.id)}
                          >
                            Save round
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => advanceIntoRound(drive.id)}
                          >
                            Move shortlisted → in round
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="cta-row" style={{ marginTop: "0.6rem" }}>
                      <button className="btn ghost" onClick={() => viewApplicants(drive.id)}>
                        Applicants
                      </button>
                    </div>
                  </article>
                );
              })}
              {!visibleDrives.length && (
                <EmptyState
                  title={drives.length ? "No matching drives" : "No drives yet"}
                  message={
                    drives.length
                      ? "Try another search term."
                      : "Propose a drive with a preferred date and time to get started."
                  }
                  actionLabel={drives.length ? "Clear search" : "Propose drive"}
                  onAction={drives.length ? () => setDriveQuery("") : () => setTab("post")}
                />
              )}
            </div>
          </>
        )}

        {tab === "calendar" && (
          <>
            <div className="panel-head">
              <h3>Campus calendar</h3>
              <p className="muted">
                Plan around your drives, other companies, and exam/blocked days
              </p>
            </div>
            <div className="calendar-layout">
              <MonthCalendar
                markedDates={markedDriveDates}
                mineDates={mineDates}
                otherDates={otherDates}
                blockedDates={blockedDateMap}
                selectedDate={calendarDay}
                onSelectDate={setCalendarDay}
                showKindLegend
              />
              <div className="calendar-day-panel">
                <h4>{calendarDay ? `Schedule · ${calendarDay}` : "Select a day"}</h4>
                {calendarDay && (
                  <div className="card-list">
                    {blocksOnDay.map((block) => (
                      <article key={`b-${block.id}`} className="soft-card">
                        <strong>{block.title}</strong>
                        <p className="muted">
                          Blocked / exam
                          {block.reason ? ` · ${block.reason}` : ""}
                        </p>
                      </article>
                    ))}
                    {drivesOnDay.map((drive) => (
                      <article key={drive.id} className="soft-card">
                        <div className="row-card" style={{ padding: 0, border: "none" }}>
                          <div>
                            <strong>
                              {drive.is_mine ? "Your drive · " : ""}
                              {drive.title}
                            </strong>
                            <p className="muted">
                              {drive.is_mine
                                ? "You"
                                : drive.company_name || "Another company"}{" "}
                              · {drive.drive_time || "Time TBA"} ·{" "}
                              {driveStatusLabel(drive.status)}
                            </p>
                            <p className="muted">
                              Branches: {drive.eligible_branches || "All"}
                            </p>
                          </div>
                          <StatusPill status={drive.status} />
                        </div>
                      </article>
                    ))}
                    {!drivesOnDay.length && !blocksOnDay.length && (
                      <EmptyState
                        title="Free day"
                        message="No drives or exam blocks on this date — a good slot to propose."
                        actionLabel="Propose drive"
                        onAction={() => {
                          setForm((f) => ({ ...f, drive_date: calendarDay }));
                          setTab("post");
                        }}
                      />
                    )}
                  </div>
                )}
                {!calendarDay && (
                  <p className="muted">
                    Tap a marked day to see clashes before proposing a drive.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {tab === "post" && (
          <>
            <div className="panel-head">
              <h3>Propose a drive</h3>
              <p className="muted">
                Check Calendar first, then set a preferred date and time.
              </p>
            </div>
            <form className="grid-form surface-form" onSubmit={createDrive}>
              <label>
                Title
                <input value={form.title} onChange={update("title")} required />
              </label>
              <label>
                Role
                <input value={form.role} onChange={update("role")} />
              </label>
              <label>
                Package (LPA)
                <input
                  value={form.package_lpa}
                  onChange={update("package_lpa")}
                  type="number"
                  step="0.1"
                />
              </label>
              <label>
                Location
                <input value={form.location} onChange={update("location")} />
              </label>
              <label>
                Preferred date
                <input value={form.drive_date} onChange={update("drive_date")} type="date" />
              </label>
              <label>
                Preferred time
                <input value={form.drive_time} onChange={update("drive_time")} type="time" />
              </label>
              <label>
                Deadline
                <input value={form.deadline} onChange={update("deadline")} type="date" />
              </label>
              <label className="full">
                Alternate dates (comma-separated YYYY-MM-DD)
                <input
                  value={form.alternate_dates}
                  onChange={update("alternate_dates")}
                  placeholder="2026-03-20,2026-03-25"
                />
              </label>
              <label>
                Min CGPA
                <input
                  value={form.min_cgpa}
                  onChange={update("min_cgpa")}
                  type="number"
                  step="0.1"
                />
              </label>
              <label>
                Eligible branches
                <input value={form.eligible_branches} onChange={update("eligible_branches")} />
              </label>
              <label className="full">
                Description
                <textarea value={form.description} onChange={update("description")} rows={3} />
              </label>
              <button className="btn primary" type="submit">
                Submit for scheduling
              </button>
            </form>
          </>
        )}

        {tab === "applicants" && (
          <>
            <div className="panel-head">
              <h3>Applicants</h3>
              <p className="muted">
                {selectedDrive
                  ? `${selectedTitle || "Drive"} · Round: ${
                      drives.find((d) => d.id === selectedDrive)?.current_round_label || "—"
                    }`
                  : "Pick a drive from My drives first"}
              </p>
            </div>
            {!selectedDrive && (
              <p className="muted empty-note">
                Go to{" "}
                <button className="text-link" onClick={() => setTab("drives")}>
                  My drives
                </button>{" "}
                and click Applicants.
              </p>
            )}
            {selectedDrive && (
              <div className="card-list">
                <label className="full search-field">
                  Search applicants
                  <input
                    value={applicantQuery}
                    onChange={(e) => setApplicantQuery(e.target.value)}
                    placeholder="Name, branch, or status"
                  />
                </label>
                {visibleApplicants.map((app) => (
                  <article key={app.id} className="soft-card">
                    <div className="row-card" style={{ padding: 0, border: "none" }}>
                      <div>
                        <strong>{app.student?.full_name}</strong>
                        <p className="muted">
                          {app.student?.branch} · CGPA {app.student?.cgpa}
                          {app.last_round_cleared_label
                            ? ` · Cleared: ${app.last_round_cleared_label}`
                            : ""}
                          {app.attended_current_round ? " · Attended" : ""}
                        </p>
                      </div>
                      <StatusPill kind="app" status={app.status} label={app.status_label} />
                    </div>
                    <div className="sheet-actions-row" style={{ marginTop: "0.55rem" }}>
                      {app.student?.has_resume && (
                        <button
                          className="btn ghost"
                          onClick={() =>
                            downloadPdf(
                              `/students/${app.student.id}/resume`,
                              app.student.resume_original_name ||
                                `${app.student.full_name || "student"}_resume.pdf`
                            )
                          }
                        >
                          Resume
                        </button>
                      )}
                      {APP_STATUSES.map((s) => (
                        <button
                          key={s.key}
                          className={`btn ghost${app.status === s.key ? " is-active-btn" : ""}`}
                          type="button"
                          onClick={() => setStatus(app.id, s.key)}
                        >
                          {s.label}
                        </button>
                      ))}
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() =>
                          setStatus(app.id, {
                            status: app.status,
                            attended: !app.attended_current_round,
                          })
                        }
                      >
                        {app.attended_current_round ? "Unmark attendance" : "Mark attendance"}
                      </button>
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => {
                          const drive = drives.find((d) => d.id === selectedDrive);
                          const round = drive?.current_round;
                          if (!round || round === "registration") return;
                          setStatus(app.id, {
                            status: app.status === "rejected" ? "in_round" : app.status,
                            last_round_cleared: round,
                          });
                        }}
                      >
                        Cleared this round
                      </button>
                    </div>
                    {app.status === "selected" && (
                      <div className="cta-row" style={{ marginTop: "0.55rem" }}>
                        {app.has_offer_letter ? (
                          <button
                            className="btn primary"
                            onClick={() =>
                              downloadPdf(
                                `/applications/${app.id}/offer`,
                                app.offer_original_name || "offer_letter.pdf"
                              )
                            }
                          >
                            Download offer
                          </button>
                        ) : (
                          <>
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(e) =>
                                setOfferFiles({
                                  ...offerFiles,
                                  [app.id]: e.target.files?.[0] || null,
                                })
                              }
                            />
                            <button className="btn primary" onClick={() => uploadOffer(app.id)}>
                              Upload offer letter
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </article>
                ))}
                {!visibleApplicants.length && (
                  <EmptyState
                    title={applicants.length ? "No matching applicants" : "No applicants yet"}
                    message={
                      applicants.length
                        ? "Try another search term."
                        : "Once students apply to this drive, you can shortlist and move them through rounds here."
                    }
                    actionLabel={applicants.length ? "Clear search" : undefined}
                    onAction={applicants.length ? () => setApplicantQuery("") : undefined}
                  />
                )}
              </div>
            )}
          </>
        )}
      </section>
      )}
    </div>
  );
}
