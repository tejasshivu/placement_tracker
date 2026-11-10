import { useEffect, useState } from "react";
import api from "../api";

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
  const [pending, setPending] = useState([]);
  const [drives, setDrives] = useState([]);
  const [report, setReport] = useState(emptyReport);
  const [announcement, setAnnouncement] = useState({ title: "", body: "" });
  const [announcements, setAnnouncements] = useState([]);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [p, d, a, r] = await Promise.all([
      api.get("/placement/companies/pending"),
      api.get("/drives"),
      api.get("/placement/announcements"),
      api.get("/placement/reports"),
    ]);
    setPending(p.data);
    setDrives(d.data);
    setAnnouncements(a.data);
    setReport(r.data);
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

  const s = report.summary;

  return (
    <div className="dashboard">
      <h2>Placement team dashboard</h2>
      {message && <p className="ok">{message}</p>}

      <h3>Placement reports</h3>
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
        <div>
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
        <div>
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

      <h3>Pending company approvals</h3>
      <div className="list">
        {pending.map((c) => (
          <article key={c.id} className="item">
            <div>
              <strong>{c.company_name}</strong>
              <p className="muted">{c.email}</p>
            </div>
            <button className="btn primary" onClick={() => approve(c.id)}>
              Approve
            </button>
          </article>
        ))}
        {!pending.length && <p className="muted">No pending companies.</p>}
      </div>

      <h3>All drives</h3>
      <div className="list">
        {drives.map((drive) => (
          <article key={drive.id} className="item">
            <div>
              <strong>{drive.title}</strong>
              <p className="muted">
                {drive.company_name} · {drive.drive_date || "TBA"} · {drive.package_lpa || "-"} LPA
              </p>
            </div>
          </article>
        ))}
      </div>

      <h3>Post announcement</h3>
      <form className="grid-form" onSubmit={postAnnouncement}>
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

      <h3>Announcements</h3>
      <div className="list">
        {announcements.map((a) => (
          <article key={a.id} className="item">
            <div>
              <strong>{a.title}</strong>
              <p>{a.body}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
