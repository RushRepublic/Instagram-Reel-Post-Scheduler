import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { AppDataProvider } from "./context/AppDataContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CreatePost from "./pages/CreatePost";
import CreateReel from "./pages/CreateReel";
import Scheduled from "./pages/Scheduled";
import Published from "./pages/Published";
import Failed from "./pages/Failed";
import Calendar from "./pages/Calendar";
import Accounts from "./pages/Accounts";
import Analytics from "./pages/Analytics";
import Settings from "./pages/Settings";

function ProtectedRoute({ children }) {
  const { isLoggedIn, checkingSession } = useAuth();
  if (checkingSession) return null;
  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { isLoggedIn, checkingSession } = useAuth();

  if (checkingSession) return null;

  return (
    <Routes>
      <Route path="/login" element={isLoggedIn ? <Navigate to="/app/dashboard" replace /> : <Login />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppDataProvider>
              <Layout />
            </AppDataProvider>
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="create-post" element={<CreatePost />} />
        <Route path="create-reel" element={<CreateReel />} />
        <Route path="scheduled" element={<Scheduled />} />
        <Route path="published" element={<Published />} />
        <Route path="failed" element={<Failed />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to={isLoggedIn ? "/app/dashboard" : "/login"} replace />} />
    </Routes>
  );
}
