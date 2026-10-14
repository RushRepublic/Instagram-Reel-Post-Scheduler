import { useLocation } from "react-router-dom";
import { useToast } from "../context/ToastContext";

const TITLES = {
  "/app/dashboard": "Dashboard",
  "/app/create-post": "Create Post",
  "/app/create-reel": "Create Reel",
  "/app/scheduled": "Scheduled Content",
  "/app/published": "Published Content",
  "/app/failed": "Failed Content",
  "/app/calendar": "Calendar",
  "/app/accounts": "Instagram Accounts",
  "/app/analytics": "Analytics",
  "/app/settings": "Settings",
};

export default function Header({ onHamburger }) {
  const location = useLocation();
  const { showToast } = useToast();
  const title = TITLES[location.pathname] || "Dashboard";

  return (
    <header className="top-header">
      <button className="hamburger-btn" onClick={onHamburger} aria-label="Menu">
        <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>
      <h1 className="page-title">{title}</h1>

      <div className="header-right">
        <button className="icon-btn" aria-label="Notifications" onClick={() => showToast("No new notifications.")}>
          <svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
          <span className="icon-btn-dot"></span>
        </button>

        <div className="header-user-avatar">A</div>
      </div>
    </header>
  );
}
