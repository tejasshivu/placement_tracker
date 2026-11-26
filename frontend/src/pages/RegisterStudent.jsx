import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";
import { COURSES, SEMESTERS } from "../constants/courses";
import { cgpaKeyDown, parseCgpa, sanitizeCgpaInput } from "../utils/cgpa";
import { collegeEmailHint, parseCollegeEmail } from "../utils/collegeEmail";
import { parsePhone, phoneKeyDown, sanitizePhoneInput } from "../utils/phone";

export default function RegisterStudent() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    branch: "",
    semester: "",
    cgpa: "",
    phone: "",
  });
  const [error, setError] = useState("");

  const update = (key) => (e) => {
    if (key === "cgpa") {
      setForm({ ...form, cgpa: sanitizeCgpaInput(e.target.value) });
      return;
    }
    if (key === "phone") {
      setForm({ ...form, phone: sanitizePhoneInput(e.target.value) });
      return;
    }
    setForm({ ...form, [key]: e.target.value });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const parsed = parseCgpa(form.cgpa);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const phone = parsePhone(form.phone);
    if (!phone.ok) {
      setError(phone.error);
      return;
    }
    const collegeEmail = parseCollegeEmail(form.email);
    if (!collegeEmail.ok) {
      setError(collegeEmail.error);
      return;
    }
    try {
      await api.post("/auth/register/student", {
        ...form,
        email: collegeEmail.email,
        semester: form.semester ? Number(form.semester) : null,
        cgpa: parsed.value,
        phone: phone.value,
      });
      navigate("/login");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    }
  };

  return (
    <div className="login-stage">
      <section className="login-panel brand-panel">
        <p className="login-kicker">Ascendia</p>
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
            College email
            <input
              value={form.email}
              onChange={update("email")}
              type="email"
              placeholder="name@college.edu"
              required
            />
            <span className="muted field-hint">{collegeEmailHint()}</span>
          </label>
          <label>
            Password
            <input value={form.password} onChange={update("password")} type="password" required />
          </label>
          <label>
            Course / Branch
            <select value={form.branch} onChange={update("branch")} required>
              <option value="">Select course</option>
              {COURSES.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>
          </label>
          <label>
            Semester
            <select value={form.semester} onChange={update("semester")}>
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
              value={form.cgpa}
              onChange={update("cgpa")}
              onKeyDown={cgpaKeyDown}
              type="text"
              inputMode="decimal"
            />
          </label>
          <label className="full">
            Phone
            <input
              value={form.phone}
              onChange={update("phone")}
              onKeyDown={phoneKeyDown}
              type="text"
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
            />
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
