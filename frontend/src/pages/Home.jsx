import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";

export default function Home() {
  const { user } = useAuth();

  return (
    <section className="hero hero-stage">
      <div className="hero-copy">
        <p className="brand">Ascendia</p>
        <h1>College placement, in one place</h1>
        <p className="lead">
          Students track drives. Companies hire. Placement teams run the portal.
        </p>
        <div className="cta-row">
          {user ? (
            <Link className="btn primary" to={`/${user.role}`}>
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link className="btn primary" to="/login">
                Log in
              </Link>
              <Link className="btn ghost" to="/register/student">
                Sign up
              </Link>
            </>
          )}
        </div>
        {!user && (
          <p className="muted hero-secondary-link">
            Hiring as a company? <Link to="/register/company">Register here</Link>
          </p>
        )}
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="hero-frame">
          <p className="hero-frame-kicker">Campus portal</p>
          <p className="hero-frame-title">Drives · Applications · Offers</p>
          <div className="hero-frame-lines">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}
