import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(`/${user.role}`);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-stage">
      <section className="login-panel brand-panel">
        <p className="login-kicker">CampusHire</p>
        <h1>Sign in to your placement portal</h1>
        <p>
          Students track drives. Companies hire. Placement teams run everything from one
          place.
        </p>
      </section>

      <section className="login-panel form-panel">
        <h2>Welcome back</h2>
        <p className="muted">Enter your college or company account details.</p>

        <form onSubmit={onSubmit} className="login-form">
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="you@college.edu"
              required
            />
          </label>

          <label>
            Password
            <div className="password-field">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Your password"
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <div className="auth-row">
            <Link className="text-link" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          {error && <p className="error">{error}</p>}

          <button className="btn primary wide" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="login-footer">
          <p className="muted">
            New student? <Link to="/register/student">Create account</Link>
          </p>
          <p className="muted">
            Hiring company? <Link to="/register/company">Request access</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
