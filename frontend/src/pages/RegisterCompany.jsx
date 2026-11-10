import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";

export default function RegisterCompany() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    company_name: "",
    website: "",
    hr_contact: "",
    description: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const { data } = await api.post("/auth/register/company", form);
      setMessage(data.message);
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  return (
    <div className="auth-card">
      <h2>Company registration</h2>
      <form onSubmit={onSubmit}>
        <label>
          Company name
          <input value={form.company_name} onChange={update("company_name")} required />
        </label>
        <label>
          Email
          <input value={form.email} onChange={update("email")} type="email" required />
        </label>
        <label>
          Password
          <input value={form.password} onChange={update("password")} type="password" required />
        </label>
        <label>
          Website
          <input value={form.website} onChange={update("website")} />
        </label>
        <label>
          HR contact
          <input value={form.hr_contact} onChange={update("hr_contact")} />
        </label>
        <label>
          Description
          <textarea value={form.description} onChange={update("description")} rows={3} />
        </label>
        {error && <p className="error">{error}</p>}
        {message && <p className="ok">{message}</p>}
        <button className="btn primary" type="submit">
          Request access
        </button>
      </form>
      <p className="muted">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
