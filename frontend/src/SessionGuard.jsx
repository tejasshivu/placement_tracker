import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isProtectedPath, useAuth } from "./AuthContext";

/**
 * Browser Back/Forward must not restore a logged-in desk.
 * - Any history traversal clears the session.
 * - Landing on a protected URL via Back/Forward sends you to login.
 * - bfcache restore of a protected page also forces login.
 */
export default function SessionGuard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/login") {
      logout();
    }
  }, [location.pathname, logout]);

  useEffect(() => {
    const endSessionAndGate = () => {
      logout();
      if (isProtectedPath(window.location.pathname)) {
        navigate("/login", { replace: true });
      }
    };

    const onPopState = () => {
      endSessionAndGate();
    };

    const onPageShow = (event) => {
      if (event.persisted && isProtectedPath(window.location.pathname)) {
        endSessionAndGate();
      }
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [logout, navigate]);

  return null;
}
