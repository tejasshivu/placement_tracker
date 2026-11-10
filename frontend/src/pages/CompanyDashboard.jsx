import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { downloadResume } from "../downloadResume";

const emptyDrive = {
  title: "",
  role: "",
  package_lpa: "",
  location: "",
  drive_date: "",
  deadline: "",
  min_cgpa: "6.5",
  eligible_branches: "CSE,IT,ECE",
  description: "",
};

export default function CompanyDashboard() {
  const { user } = useAuth();
  const [drives, setDrives] = useState([]);
  const [form, setForm] = useState(emptyDrive);
  const [selectedDrive, setSelectedDrive] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [message, setMessage] = useState("");

  const loadDrives = async () => {
    const { data } = await api.get("/drives");
    const mine = data.filter((d) => d.company_id === user?.profile?.id);
    // After login, /auth/me includes profile; login payload may not.
    // Fallback: show all then refine after refresh.
    setDrives(user?.profile?.id ? mine : data);
  };

  useEffect(() => {
    api
      .get("/auth/me")
      .then(async (res) => {
        const profileId = res.data.profile?.id;
        const { data } = await api.get("/drives");
        setDrives(profileId ? data.filter((d) => d.company_id === profileId) : data);
      })
      .catch(() => setMessage("Could not load drives"));
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
      setMessage("Drive created");
      await loadDrives();
    } catch (err) {
      setMessage(err.response?.data?.error || "Could not create drive");
    }
  };

  const viewApplicants = async (driveId) => {
    setSelectedDrive(driveId);
    const { data } = await api.get(`/applications/drive/${driveId}`);
    setApplicants(data);
  };

  const setStatus = async (applicationId, status) => {
    await api.patch(`/applications/${applicationId}/status`, { status });
    await viewApplicants(selectedDrive);
  };

  return (
    <div className="dashboard">
      <h2>Company dashboard</h2>
      <p className="muted">
        {user?.is_approved === false
          ? "Awaiting placement team approval."
          : `Signed in as ${user?.email}`}
      </p>
      {message && <p className="ok">{message}</p>}

      <h3>Post a drive</h3>
      <form className="grid-form" onSubmit={createDrive}>
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
          <input value={form.package_lpa} onChange={update("package_lpa")} type="number" step="0.1" />
        </label>
        <label>
          Location
          <input value={form.location} onChange={update("location")} />
        </label>
        <label>
          Drive date
          <input value={form.drive_date} onChange={update("drive_date")} type="date" />
        </label>
        <label>
          Deadline
          <input value={form.deadline} onChange={update("deadline")} type="date" />
        </label>
        <label>
          Min CGPA
          <input value={form.min_cgpa} onChange={update("min_cgpa")} type="number" step="0.1" />
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
          Publish drive
        </button>
      </form>

      <h3>Your drives</h3>
      <div className="list">
        {drives.map((drive) => (
          <article key={drive.id} className="item">
            <div>
              <strong>{drive.title}</strong>
              <p className="muted">
                {drive.role} · {drive.drive_date || "TBA"}
              </p>
            </div>
            <button className="btn ghost" onClick={() => viewApplicants(drive.id)}>
              Applicants
            </button>
          </article>
        ))}
      </div>

      {selectedDrive && (
        <>
          <h3>Applicants</h3>
          <div className="list">
            {applicants.map((app) => (
              <article key={app.id} className="item">
                <div>
                  <strong>{app.student?.full_name}</strong>
                  <p className="muted">
                    {app.student?.branch} · CGPA {app.student?.cgpa} · {app.status}
                  </p>
                </div>
                <div className="cta-row">
                  {app.student?.has_resume && (
                    <button
                      className="btn ghost"
                      onClick={() =>
                        downloadResume(
                          `/students/${app.student.id}/resume`,
                          app.student.resume_original_name ||
                            `${app.student.full_name || "student"}_resume.pdf`
                        )
                      }
                    >
                      Resume
                    </button>
                  )}
                  <button className="btn ghost" onClick={() => setStatus(app.id, "shortlisted")}>
                    Shortlist
                  </button>
                  <button className="btn ghost" onClick={() => setStatus(app.id, "selected")}>
                    Select
                  </button>
                  <button className="btn ghost" onClick={() => setStatus(app.id, "rejected")}>
                    Reject
                  </button>
                </div>
              </article>
            ))}
            {!applicants.length && <p className="muted">No applicants yet.</p>}
          </div>
        </>
      )}
    </div>
  );
}
