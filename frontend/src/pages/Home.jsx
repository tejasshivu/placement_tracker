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
                Student sign up
              </Link>
              <Link className="btn ghost" to="/register/company">
                Company sign up
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="hero-visual" aria-hidden="true">
        <div className="hero-orb hero-orb-a" />
        <div className="hero-orb hero-orb-b" />
        <div className="hero-frame">
          <p className="hero-frame-kicker">Live campus portal</p>
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
