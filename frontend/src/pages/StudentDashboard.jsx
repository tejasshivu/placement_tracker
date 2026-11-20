import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { downloadPdf, downloadResume } from "../downloadResume";
import DashboardTabs from "../components/DashboardTabs";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import StatusPill from "../components/StatusPill";
import { COURSES, SEMESTERS } from "../constants/courses";
import { roundLabel } from "../constants/rounds";
import { formatDriveWhen } from "../utils/driveWhen";

export default function StudentDashboard() {
  const { user, setUser } = useAuth();
  const [tab, setTab] = useState("overview");
  const [drives, setDrives] = useState([]);
  const [applications, setApplications] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [profile, setProfile] = useState({
    full_name: "",
    branch: "",
    semester: "",
    cgpa: "",
    phone: "",
    has_resume: false,
    resume_original_name: "",
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [driveQuery, setDriveQuery] = useState("");

  const load = async () => {
    const [d, a, me, notices] = await Promise.all([
      api.get("/drives"),
      api.get("/applications/mine"),
      api.get("/auth/me"),
      api.get("/placement/announcements"),
    ]);
    setDrives(d.data);
    setApplications(a.data);
    setAnnouncements(notices.data);
    setUser(me.data);
    if (me.data.profile) {
      setProfile({
        full_name: me.data.profile.full_name || "",
        branch: me.data.profile.branch || "",
        semester: me.data.profile.semester ?? "",
        cgpa: me.data.profile.cgpa ?? "",
        phone: me.data.profile.phone || "",
        has_resume: !!me.data.profile.has_resume,
        resume_original_name: me.data.profile.resume_original_name || "",
      });
    }
  };

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => setError("Could not load data"))
      .finally(() => setLoading(false));
  }, []);

  const updateField = (key) => (e) => setProfile({ ...profile, [key]: e.target.value });

  const saveProfile = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    const cgpa = profile.cgpa === "" ? null : Number(profile.cgpa);
    if (cgpa !== null && (cgpa < 0 || cgpa > 10)) {
      setError("CGPA must be between 0 and 10");
      return;
    }
    try {
      const { data } = await api.patch("/students/me", {
        full_name: profile.full_name,
        branch: profile.branch,
        semester: profile.semester === "" ? null : Number(profile.semester),
        cgpa,
        phone: profile.phone,
      });
      setProfile({
        ...profile,
        ...data,
        semester: data.semester ?? "",
        cgpa: data.cgpa ?? "",
      });
      setMessage("Profile saved — eligible drives refreshed");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save profile");
    }
  };

  const uploadResume = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    if (!resumeFile) {
      setError("Choose a PDF file first");
      return;
    }
    const formData = new FormData();
    formData.append("resume", resumeFile);
    try {
      const { data } = await api.post("/students/me/resume", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile({
        ...profile,
        has_resume: true,
        resume_original_name: data.profile.resume_original_name,
      });
      setResumeFile(null);
      setMessage("Resume uploaded");
      const me = await api.get("/auth/me");
      setUser(me.data);
    } catch (err) {
      setError(err.response?.data?.error || "Resume upload failed");
    }
  };

  const apply = async (driveId) => {
    setMessage("");
    setError("");
    try {
      await api.post("/applications", { drive_id: driveId });
      setMessage("Applied successfully");
      await load();
      setTab("applications");
    } catch (err) {
      setError(err.response?.data?.error || "Apply failed");
    }
  };

  const appliedIds = new Set(applications.map((a) => a.drive_id));
  const driveQ = driveQuery.trim().toLowerCase();
  const visibleDrives = drives.filter((drive) => {
    if (!driveQ) return true;
    return [drive.title, drive.company_name, drive.role, drive.eligible_branches]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(driveQ));
  });
  const checklist = [
    {
      id: "branch",
      label: "Set your course / branch",
      done: Boolean(profile.branch),
      action: () => setTab("profile"),
    },
    {
      id: "cgpa",
      label: "Add your CGPA",
      done: profile.cgpa !== "" && profile.cgpa != null,
      action: () => setTab("profile"),
    },
    {
      id: "resume",
      label: "Upload your resume (PDF)",
      done: Boolean(profile.has_resume),
      action: () => setTab("profile"),
    },
    {
      id: "apply",
      label: "Apply to an eligible drive",
      done: applications.length > 0,
      action: () => setTab("drives"),
    },
  ];
  const checklistDone = checklist.filter((item) => item.done).length;
  const tabs = [
    { id: "overview", label: "Overview", count: announcements.length },
    { id: "drives", label: "Drives", count: drives.length },
    { id: "applications", label: "Applications", count: applications.length },
    { id: "profile", label: "Profile" },
  ];

  return (
    <div className="dashboard dash-shell">
      <header className="dash-header">
        <div>
          <p className="dash-eyebrow">Student workspace</p>
          <h2>Hello{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}</h2>
          <p className="muted">Signed in as {user?.email}</p>
        </div>
        <div className="dash-quick-stats">
          <div className="mini-stat">
            <span>Drives</span>
            <strong>{drives.length}</strong>
          </div>
          <div className="mini-stat">
            <span>Applied</span>
            <strong>{applications.length}</strong>
          </div>
          <div className="mini-stat">
            <span>Resume</span>
            <strong>{profile.has_resume ? "Ready" : "Missing"}</strong>
          </div>
        </div>
      </header>

      {(message || error) && (
        <div className={`toast-banner ${error ? "is-error" : "is-ok"}`}>
          {error || message}
        </div>
      )}

      <DashboardTabs tabs={tabs} active={tab} onChange={setTab} />

      {loading ? (
        <section className="tab-panel">
          <LoadingSkeleton rows={4} />
        </section>
      ) : (
      <section className="tab-panel" key={tab}>
        {tab === "overview" && (
          <>
            <div className="panel-head">
              <h3>Get started</h3>
              <p className="muted">
                {checklistDone}/{checklist.length} steps done — finish these to apply faster
              </p>
            </div>
            <div className="checklist">
              {checklist.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`checklist-item ${item.done ? "is-done" : ""}`}
                  onClick={item.action}
                >
                  <span className="check-mark">{item.done ? "✓" : ""}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="panel-head" style={{ marginTop: "1.2rem" }}>
              <h3>Announcements</h3>
              <p className="muted">Latest notes from the placement team</p>
            </div>
            <div className="card-list">
              {announcements.map((notice) => (
                <article key={notice.id} className="soft-card">
                  <strong>{notice.title}</strong>
                  <p>{notice.body}</p>
                  <p className="muted">
                    {notice.created_at ? new Date(notice.created_at).toLocaleString() : ""}
                  </p>
                </article>
              ))}
              {!announcements.length && (
                <EmptyState
                  title="No announcements yet"
                  message="When placement posts updates or round changes, they’ll show up here."
                />
              )}
            </div>
          </>
        )}

        {tab === "drives" && (
          <>
            <div className="panel-head">
              <h3>Eligible drives</h3>
              <p className="muted">
                Filtered by your branch and CGPA
                {profile.branch || profile.cgpa !== ""
                  ? ` · ${profile.branch || "No branch"} · CGPA ${
                      profile.cgpa !== "" ? profile.cgpa : "—"
                    }`
                  : " · complete Profile to unlock more drives"}
              </p>
            </div>
            <label className="full search-field">
              Search drives
              <input
                value={driveQuery}
                onChange={(e) => setDriveQuery(e.target.value)}
                placeholder="Company, role, or branch"
              />
            </label>
            <div className="card-list">
              {visibleDrives.map((drive) => {
                const canApply =
                  !appliedIds.has(drive.id) &&
                  drive.accepting_applications !== false &&
                  drive.eligible !== false;
                const info = drive.current_round_info || {};
                return (
                  <article key={drive.id} className="soft-card">
                    <div className="row-card" style={{ padding: 0, border: "none" }}>
                      <div>
                        <strong>{drive.title}</strong>
                        <p>
                          {drive.company_name} · {drive.role || "Role TBA"} ·{" "}
                          {drive.package_lpa ? `${drive.package_lpa} LPA` : "Package TBA"}
                        </p>
                        <p className="muted">
                          Drive: {formatDriveWhen(drive)} · Min CGPA: {drive.min_cgpa ?? "-"} ·
                          Branches: {drive.eligible_branches || "All"}
                        </p>
                        <p className="muted">
                          Round:{" "}
                          <strong>
                            {drive.current_round_label || roundLabel(drive.current_round)}
                          </strong>
                          {info.date || info.time
                            ? ` · ${[info.date, info.time].filter(Boolean).join(" · ")}`
                            : ""}
                          {info.venue ? ` · ${info.venue}` : ""}
                        </p>
                        {info.meet_link && (
                          <p className="muted">
                            Link:{" "}
                            <a href={info.meet_link} target="_blank" rel="noreferrer">
                              Join
                            </a>
                          </p>
                        )}
                        {drive.eligible === false && drive.eligibility_reasons?.length > 0 && (
                          <p className="warn-note">{drive.eligibility_reasons[0]}</p>
                        )}
                      </div>
                      <button
                        className="btn primary"
                        disabled={!canApply}
                        onClick={() => apply(drive.id)}
                      >
                        {appliedIds.has(drive.id)
                          ? "Applied"
                          : drive.accepting_applications === false
                            ? "Registration closed"
                            : drive.eligible === false
                              ? "Not eligible"
                              : "Apply"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {!visibleDrives.length && (
                <EmptyState
                  title={drives.length ? "No matching drives" : "No eligible drives right now"}
                  message={
                    drives.length
                      ? "Try a different search, or clear the filter."
                      : "Update your branch and CGPA in Profile, or check back when new drives open."
                  }
                  actionLabel={drives.length ? "Clear search" : "Go to Profile"}
                  onAction={
                    drives.length ? () => setDriveQuery("") : () => setTab("profile")
                  }
                />
              )}
            </div>
          </>
        )}

        {tab === "applications" && (
          <>
            <div className="panel-head">
              <h3>My applications</h3>
              <p className="muted">Track status and download offer letters when selected</p>
            </div>
            <div className="card-list">
              {applications.map((app) => (
                <article key={app.id} className="soft-card">
                  <div className="row-card" style={{ padding: 0, border: "none" }}>
                    <div>
                      <strong>{app.drive?.title}</strong>
                      <p className="muted">
                        {app.drive?.company_name || "Company"} · {formatDriveWhen(app.drive)}
                      </p>
                      <p className="muted">
                        Drive round:{" "}
                        {app.drive?.current_round_label ||
                          roundLabel(app.drive?.current_round)}
                        {app.last_round_cleared_label
                          ? ` · Cleared: ${app.last_round_cleared_label}`
                          : ""}
                      </p>
                      {app.next_step && <p className="next-step">{app.next_step}</p>}
                    </div>
                    <StatusPill
                      kind="app"
                      status={app.status}
                      label={app.status_label}
                    />
                  </div>
                  {app.status === "selected" && (
                    <div className="cta-row" style={{ marginTop: "0.8rem" }}>
                      {app.has_offer_letter ? (
                        <button
                          className="btn primary"
                          type="button"
                          onClick={() =>
                            downloadPdf(
                              `/applications/${app.id}/offer`,
                              app.offer_original_name || "offer_letter.pdf"
                            ).catch(() => setError("Could not download offer letter"))
                          }
                        >
                          Download offer letter
                        </button>
                      ) : (
                        <p className="muted">Selected — offer letter not uploaded yet.</p>
                      )}
                    </div>
                  )}
                </article>
              ))}
              {!applications.length && (
                <EmptyState
                  title="No applications yet"
                  message="Browse eligible drives and apply when your profile is ready."
                  actionLabel="View drives"
                  onAction={() => setTab("drives")}
                />
              )}
            </div>
          </>
        )}

        {tab === "profile" && (
          <>
            <div className="panel-head">
              <h3>Profile & resume</h3>
              <p className="muted">Keep your details current before applying</p>
            </div>
            <form className="grid-form surface-form" onSubmit={saveProfile}>
              <label>
                Full name
                <input value={profile.full_name} onChange={updateField("full_name")} required />
              </label>
              <label>
                Course / Branch
                <select value={profile.branch} onChange={updateField("branch")}>
                  <option value="">Select course</option>
                  {COURSES.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                  {profile.branch && !COURSES.includes(profile.branch) && (
                    <option value={profile.branch}>{profile.branch}</option>
                  )}
                </select>
              </label>
              <label>
                Semester
                <select value={profile.semester} onChange={updateField("semester")}>
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
                  value={profile.cgpa}
                  onChange={updateField("cgpa")}
                  type="number"
                  step="0.01"
                  min="0"
                  max="10"
                />
              </label>
              <label className="full">
                Phone
                <input value={profile.phone} onChange={updateField("phone")} />
              </label>
              <button className="btn primary" type="submit">
                Save profile
              </button>
            </form>

            <div className="panel-head" style={{ marginTop: "1.4rem" }}>
              <h3>Resume</h3>
              <p className="muted">PDF only, max 5 MB. Required before applying.</p>
            </div>
            <p className="muted">
              {profile.has_resume
                ? `Uploaded: ${profile.resume_original_name || "resume.pdf"}`
                : "No resume uploaded yet."}
            </p>
            <form className="grid-form surface-form" onSubmit={uploadResume}>
              <label className="full">
                Choose PDF
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                />
              </label>
              <div className="cta-row">
                <button className="btn primary" type="submit">
                  Upload resume
                </button>
                {profile.has_resume && (
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() =>
                      downloadResume(
                        "/students/me/resume",
                        profile.resume_original_name || "resume.pdf"
                      ).catch(() => setError("Could not download resume"))
                    }
                  >
                    Download my resume
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </section>
      )}
    </div>
  );
}
