import { useEffect, useState } from "react";
import api from "../api";

export default function PlacementDashboard() {
  const [pending, setPending] = useState([]);
  const [drives, setDrives] = useState([]);
  const [announcement, setAnnouncement] = useState({ title: "", body: "" });
  const [announcements, setAnnouncements] = useState([]);
  const [message, setMessage] = useState("");

  const load = async () => {
    const [p, d, a] = await Promise.all([
      api.get("/placement/companies/pending"),
      api.get("/drives"),
      api.get("/placement/announcements"),
    ]);
    setPending(p.data);
    setDrives(d.data);
    setAnnouncements(a.data);
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

  return (
    <div className="dashboard">
      <h2>Placement team dashboard</h2>
      {message && <p className="ok">{message}</p>}

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
      <form
        className="grid-form"
        onSubmit={postAnnouncement}
      >
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
