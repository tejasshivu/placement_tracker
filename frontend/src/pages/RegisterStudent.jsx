import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";

export default function RegisterStudent() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    branch: "",
    year: "",
    cgpa: "",
    phone: "",
  });
  const [error, setError] = useState("");

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/register/student", {
        ...form,
        year: form.year ? Number(form.year) : null,
        cgpa: form.cgpa ? Number(form.cgpa) : null,
      });
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  return (
    <div className="login-stage">
      <section className="login-panel brand-panel">
        <p className="login-kicker">CampusHire</p>
        <h1>Join as a student</h1>
        <p>Build your profile, track drives, and manage applications in one portal.</p>
      </section>

      <section className="login-panel form-panel">
        <h2>Student registration</h2>
        <p className="muted">Create your campus placement account.</p>
        <form onSubmit={onSubmit} className="login-form register-grid">
          <label>
            Full name
            <input value={form.full_name} onChange={update("full_name")} required />
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
            Branch
            <input value={form.branch} onChange={update("branch")} placeholder="CSE" />
          </label>
          <label>
            Year
            <input value={form.year} onChange={update("year")} type="number" />
          </label>
          <label>
            CGPA
            <input value={form.cgpa} onChange={update("cgpa")} type="number" step="0.01" />
          </label>
          <label className="full">
            Phone
            <input value={form.phone} onChange={update("phone")} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary wide" type="submit">
            Create account
          </button>
        </form>
        <p className="muted">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </section>
    </div>
  );
}
