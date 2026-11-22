import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { parsePhone, phoneKeyDown, sanitizePhoneInput } from "../utils/phone";

export default function RegisterCompany() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    company_name: "",
    website: "",
    hr_name: "",
    hr_contact: "",
    description: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const update = (key) => (e) => {
    if (key === "hr_contact") {
      setForm({ ...form, hr_contact: sanitizePhoneInput(e.target.value) });
      return;
    }
    setForm({ ...form, [key]: e.target.value });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const phone = parsePhone(form.hr_contact);
    if (!phone.ok) {
      setError(phone.error);
      return;
    }
    if (form.hr_contact && !form.hr_name.trim()) {
      setError("Enter the HR contact person’s name");
      return;
    }
    try {
      const { data } = await api.post("/auth/register/company", {
        ...form,
        hr_name: form.hr_name.trim() || null,
        hr_contact: phone.value,
      });
      setMessage(data.message);
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  return (
    <div className="login-stage">
      <section className="login-panel brand-panel">
        <p className="login-kicker">Ascendia</p>
        <h1>Hire from campus</h1>
        <p>Request access, propose drives, and manage applicants with the placement team.</p>
      </section>

      <section className="login-panel form-panel">
        <h2>Company registration</h2>
        <p className="muted">Placement approval is required before posting drives.</p>
        <form onSubmit={onSubmit} className="login-form">
          <label>
            Company name
            <input value={form.company_name} onChange={update("company_name")} required />
          </label>
          <label>
            Login email
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
            HR name
            <input value={form.hr_name} onChange={update("hr_name")} />
          </label>
          <label>
            HR mobile
            <input
              value={form.hr_contact}
              onChange={update("hr_contact")}
              onKeyDown={phoneKeyDown}
              type="text"
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
            />
          </label>
          <label>
            Description
            <textarea value={form.description} onChange={update("description")} rows={3} />
          </label>
          {error && <p className="error">{error}</p>}
          {message && <p className="ok">{message}</p>}
          <button className="btn primary wide" type="submit">
            Request access
          </button>
        </form>
        <p className="muted">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </section>
    </div>
  );
}
