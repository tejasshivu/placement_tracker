import { useEffect } from "react";
import { Navigate, Route, Routes, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import SessionGuard from "./SessionGuard";
import Home from "./pages/Home";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import RegisterStudent from "./pages/RegisterStudent";
import RegisterCompany from "./pages/RegisterCompany";
import StudentDashboard from "./pages/StudentDashboard";
import CompanyDashboard from "./pages/CompanyDashboard";
import PlacementDashboard from "./pages/PlacementDashboard";

function PrivateRoute({ role, children }) {
  const { user, loading, syncSession } = useAuth();
  const hasToken = Boolean(localStorage.getItem("token"));

  useEffect(() => {
    syncSession();
  }, [syncSession]);

  if (loading) return <p className="muted">Loading…</p>;
  if (!user || !hasToken) {
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

function Shell() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <SessionGuard />
      <header className="topbar">
        <Link to="/" className="logo">
          Ascendia
        </Link>
        <nav>
          {user ? (
            <>
              <span className={`role-chip role-${user.role}`}>{user.role}</span>
              <Link className="nav-link" to={`/${user.role}`}>
                Dashboard
              </Link>
              <button className="btn ghost" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link className="nav-link" to="/login">
                Log in
              </Link>
              <Link className="nav-link" to="/register/student">
                Student
              </Link>
              <Link className="btn primary compact" to="/register/company">
                Company
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="page-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/register/student" element={<RegisterStudent />} />
          <Route path="/register/company" element={<RegisterCompany />} />
          <Route
            path="/student"
            element={
              <PrivateRoute role="student">
                <StudentDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/company"
            element={
              <PrivateRoute role="company">
                <CompanyDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/placement"
            element={
              <PrivateRoute role="placement">
                <PlacementDashboard />
              </PrivateRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
