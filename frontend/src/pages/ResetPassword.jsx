import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get("token") || "", [params]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!token) {
      setError("Missing reset token. Request a new forgot-password link.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    try {
      const { data } = await api.post("/auth/reset-password", {
        token,
        new_password: password,
      });
      setMessage(data.message);
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err.response?.data?.error || "Could not reset password");
    }
  };

  return (
    <div className="login-stage single">
      <section className="login-panel form-panel">
        <h2>Set a new password</h2>
        <p className="muted">Choose a new password for your CampusHire account.</p>

        <form onSubmit={onSubmit} className="login-form">
          <label>
            New password
            <div className="password-field">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                minLength={6}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <label>
            Confirm password
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              type={showPassword ? "text" : "password"}
              minLength={6}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}
          {message && <p className="ok">{message}</p>}

          <button className="btn primary wide" type="submit">
            Update password
          </button>
        </form>

        <p className="muted">
          <Link to="/login">Back to login</Link>
        </p>
      </section>
    </div>
  );
}
