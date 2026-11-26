import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", {
        email,
        new_password: password,
      });
      setMessage(data.message || "Password updated. You can log in now.");
      setTimeout(() => navigate("/login"), 900);
    } catch (err) {
      setError(err.response?.data?.error || "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-stage single">
      <section className="login-panel form-panel">
        <h2>Reset password</h2>
        <p className="muted">
          Enter your account email and choose a new password. Works on this site without email.
        </p>

        <form onSubmit={onSubmit} className="login-form">
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="you@college.edu"
              autoComplete="username"
            />
          </label>
          <label>
            New password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={6}
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm password
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type="password"
              required
              minLength={6}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          {message && <p className="ok">{message}</p>}
          <button className="btn primary wide" type="submit" disabled={loading}>
            {loading ? "Updating…" : "Reset password"}
          </button>
        </form>

        <p className="muted">
          Remembered it? <Link to="/login">Back to login</Link>
        </p>
      </section>
    </div>
  );
}
