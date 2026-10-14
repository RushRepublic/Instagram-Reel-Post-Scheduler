import { createContext, useContext, useState, useEffect } from "react";
import { authApi } from "../api/authApi";

// No sign-in screen: the app opens straight to the dashboard and the backend
// serves the default workspace user (see AUTH_REQUIRED in backend-node/.env).
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { user: me } = await authApi.me();
        setUser(me);
      } catch {
        // backend unreachable — pages show their own error states
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  return <AuthContext.Provider value={{ user, checkingSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
