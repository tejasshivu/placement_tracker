import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../AuthContext";
import { downloadPdf } from "../downloadResume";
import DashboardTabs from "../components/DashboardTabs";

const emptyDrive = {
  title: "",
  role: "",
  package_lpa: "",
  location: "",
  drive_date: "",
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
  const [offerFiles, setOfferFiles] = useState({});

  const loadDrives = async () => {
    const { data } = await api.get("/drives");
    setDrives(data);
  };

  useEffect(() => {
    loadDrives().catch(() => setMessage("Could not load drives"));
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
      setMessage("Drive proposed. Waiting for placement date approval.");
      await loadDrives();
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
      await api.patch(`/drives/${driveId}`, { drive_date: rescheduleDate });
      setMessage("New date proposed to placement team");
      setRescheduleDate("");
      await loadDrives();
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

  const setStatus = async (applicationId, status) => {
    await api.patch(`/applications/${applicationId}/status`, { status });
    await viewApplicants(selectedDrive);
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
  const tabs = [
    { id: "drives", label: "My drives", count: drives.length },
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

      <section className="tab-panel" key={tab}>
        {tab === "drives" && (
          <>
            <div className="panel-head">
              <h3>Your drives</h3>
              <p className="muted">Placement must approve dates before students can apply</p>
            </div>
            <div className="card-list">
              {drives.map((drive) => (
                <article key={drive.id} className="soft-card">
                  <div className="row-card" style={{ padding: 0, border: "none" }}>
                    <div>
                      <strong>{drive.title}</strong>
                      <p className="muted">
                        {drive.role} · Preferred date: {drive.drive_date || "TBA"}
                      </p>
                      {drive.alternate_dates && (
                        <p className="muted">Alternates: {drive.alternate_dates}</p>
                      )}
                      {drive.placement_note && (
                        <p className="warn-note">Placement note: {drive.placement_note}</p>
                      )}
                    </div>
                    <span className={`status-pill status-${drive.status}`}>{drive.status}</span>
                  </div>

                  {drive.status === "needs_reschedule" && (
                    <div className="cta-row" style={{ marginTop: "0.8rem" }}>
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                      />
                      <button className="btn primary" onClick={() => proposeNewDate(drive.id)}>
                        Propose new date
                      </button>
                    </div>
                  )}

                  <div className="cta-row" style={{ marginTop: "0.8rem" }}>
                    <button className="btn ghost" onClick={() => viewApplicants(drive.id)}>
                      Applicants
                    </button>
                  </div>
                </article>
              ))}
              {!drives.length && <p className="muted empty-note">No drives posted yet.</p>}
            </div>
          </>
        )}

        {tab === "post" && (
          <>
            <div className="panel-head">
              <h3>Propose a drive</h3>
              <p className="muted">Suggest preferred/alternate dates for placement review</p>
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
                  ? `Reviewing: ${selectedTitle || "selected drive"}`
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
                {applicants.map((app) => (
                  <article key={app.id} className="soft-card">
                    <div className="row-card" style={{ padding: 0, border: "none" }}>
                      <div>
                        <strong>{app.student?.full_name}</strong>
                        <p className="muted">
                          {app.student?.branch} · CGPA {app.student?.cgpa} · {app.status}
                        </p>
                      </div>
                      <span className={`status-pill status-${app.status}`}>{app.status}</span>
                    </div>
                    <div className="cta-row" style={{ marginTop: "0.8rem" }}>
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
                    {app.status === "selected" && (
                      <div className="cta-row" style={{ marginTop: "0.75rem" }}>
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
                {!applicants.length && <p className="muted empty-note">No applicants yet.</p>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
