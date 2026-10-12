import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi } from "../api/authApi";
import { ApiError } from "../api/httpClient";

const DEMO_EMAIL = "admin@rushrepublic.com";
const DEMO_PASSWORD = "admin123";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    (async () => {
      if (!authApi.isAuthenticated()) {
        setCheckingSession(false);
        return;
      }
      try {
        const { user: me } = await authApi.me();
        setUser(me);
      } catch (err) {
        if (err instanceof ApiError) {
          // stale/expired token — httpClient already cleared it
        }
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const loggedInUser = await authApi.login(email, password);
      setUser(loggedInUser);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to reach the server.";
      return { ok: false, message };
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: Boolean(user),
        user,
        checkingSession,
        login,
        logout,
        DEMO_EMAIL,
        DEMO_PASSWORD,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
