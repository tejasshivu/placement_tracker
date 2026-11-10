import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetPath, setResetPath] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setResetPath("");
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setMessage(data.message);
      if (data.dev_reset_path) {
        setResetPath(data.dev_reset_path);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Could not start password reset");
    }
  };

  return (
    <div className="login-stage single">
      <section className="login-panel form-panel">
        <h2>Forgot password</h2>
        <p className="muted">
          Enter your account email. For learning/demo, we show a reset link on screen
          instead of sending email.
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
            />
          </label>
          {error && <p className="error">{error}</p>}
          {message && <p className="ok">{message}</p>}
          {resetPath && (
            <p className="ok">
              Demo reset link: <Link to={resetPath}>Open reset page</Link>
            </p>
          )}
          <button className="btn primary wide" type="submit">
            Send reset link
          </button>
        </form>

        <p className="muted">
          Remembered it? <Link to="/login">Back to login</Link>
        </p>
      </section>
    </div>
  );
}
