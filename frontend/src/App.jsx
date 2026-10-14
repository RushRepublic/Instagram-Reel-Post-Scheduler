import { Routes, Route, Navigate } from "react-router-dom";
import { AppDataProvider } from "./context/AppDataContext";
import Layout from "./components/Layout";
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

export default function App() {
  return (
    <Routes>
      <Route
        path="/app"
        element={
          <AppDataProvider>
            <Layout />
          </AppDataProvider>
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

      <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
    </Routes>
  );
}
