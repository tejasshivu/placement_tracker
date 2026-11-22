import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "./api";

const AuthContext = createContext(null);
const TOKEN_KEY = "token";

function readToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const syncSession = useCallback(() => {
    if (!readToken()) {
      setUser(null);
      return false;
    }
    return true;
  }, []);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser, syncSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function isProtectedPath(pathname) {
  return (
    pathname === "/placement" ||
    pathname === "/student" ||
    pathname === "/company" ||
    pathname.startsWith("/placement/") ||
    pathname.startsWith("/student/") ||
    pathname.startsWith("/company/")
  );
}
