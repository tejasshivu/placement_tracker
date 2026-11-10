import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { downloadResume } from "../downloadResume";

export default function StudentDashboard() {
  const { user, setUser } = useAuth();
  const [drives, setDrives] = useState([]);
  const [applications, setApplications] = useState([]);
  const [profile, setProfile] = useState({
    full_name: "",
    branch: "",
    year: "",
    cgpa: "",
    phone: "",
    has_resume: false,
    resume_original_name: "",
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const [d, a, me] = await Promise.all([
      api.get("/drives"),
      api.get("/applications/mine"),
      api.get("/auth/me"),
    ]);
    setDrives(d.data);
    setApplications(a.data);
    setUser(me.data);
    if (me.data.profile) {
      setProfile({
        full_name: me.data.profile.full_name || "",
        branch: me.data.profile.branch || "",
        year: me.data.profile.year ?? "",
        cgpa: me.data.profile.cgpa ?? "",
        phone: me.data.profile.phone || "",
        has_resume: !!me.data.profile.has_resume,
        resume_original_name: me.data.profile.resume_original_name || "",
      });
    }
  };

  useEffect(() => {
    load().catch(() => setError("Could not load data"));
  }, []);

  const updateField = (key) => (e) => setProfile({ ...profile, [key]: e.target.value });

  const saveProfile = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      const { data } = await api.patch("/students/me", {
        full_name: profile.full_name,
        branch: profile.branch,
        year: profile.year,
        cgpa: profile.cgpa,
        phone: profile.phone,
      });
      setProfile({
        ...profile,
        ...data,
        year: data.year ?? "",
        cgpa: data.cgpa ?? "",
      });
      setMessage("Profile saved");
      const me = await api.get("/auth/me");
      setUser(me.data);
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
    } catch (err) {
      setError(err.response?.data?.error || "Apply failed");
    }
  };

  const appliedIds = new Set(applications.map((a) => a.drive_id));

  return (
    <div className="dashboard">
      <h2>Student dashboard</h2>
      <p className="muted">Signed in as {user?.email}</p>
      {message && <p className="ok">{message}</p>}
      {error && <p className="error">{error}</p>}

      <h3>My profile</h3>
      <form className="grid-form" onSubmit={saveProfile}>
        <label>
          Full name
          <input value={profile.full_name} onChange={updateField("full_name")} required />
        </label>
        <label>
          Branch
          <input value={profile.branch} onChange={updateField("branch")} placeholder="CSE" />
        </label>
        <label>
          Year
          <input value={profile.year} onChange={updateField("year")} type="number" />
        </label>
        <label>
          CGPA
          <input value={profile.cgpa} onChange={updateField("cgpa")} type="number" step="0.01" />
        </label>
        <label className="full">
          Phone
          <input value={profile.phone} onChange={updateField("phone")} />
        </label>
        <button className="btn primary" type="submit">
          Save profile
        </button>
      </form>

      <h3>Resume (PDF only, max 5 MB)</h3>
      <p className="muted">
        {profile.has_resume
          ? `Uploaded: ${profile.resume_original_name || "resume.pdf"}`
          : "No resume uploaded yet. Required before applying."}
      </p>
      <form className="grid-form" onSubmit={uploadResume}>
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

      <h3>Upcoming drives</h3>
      <div className="list">
        {drives.map((drive) => (
          <article key={drive.id} className="item">
            <div>
              <strong>{drive.title}</strong>
              <p>
                {drive.company_name} · {drive.role || "Role TBA"} ·{" "}
                {drive.package_lpa ? `${drive.package_lpa} LPA` : "Package TBA"}
              </p>
              <p className="muted">
                Drive: {drive.drive_date || "TBA"} · Min CGPA: {drive.min_cgpa ?? "-"} · Branches:{" "}
                {drive.eligible_branches || "All"}
              </p>
            </div>
            <button
              className="btn primary"
              disabled={appliedIds.has(drive.id)}
              onClick={() => apply(drive.id)}
            >
              {appliedIds.has(drive.id) ? "Applied" : "Apply"}
            </button>
          </article>
        ))}
        {!drives.length && <p className="muted">No drives yet.</p>}
      </div>

      <h3>My applications</h3>
      <div className="list">
        {applications.map((app) => (
          <article key={app.id} className="item">
            <div>
              <strong>{app.drive?.title}</strong>
              <p className="muted">Status: {app.status}</p>
            </div>
          </article>
        ))}
        {!applications.length && <p className="muted">No applications yet.</p>}
      </div>
    </div>
  );
}
