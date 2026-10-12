import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { group: null, to: "/app/dashboard", label: "Dashboard", icon: <path d="M3 12l9-9 9 9M5 10v10h14V10" /> },
  { group: "Content", to: "/app/create-post", label: "Create Post", icon: <><rect x="3" y="3" width="18" height="18" rx="1" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></> },
  { group: "Content", to: "/app/create-reel", label: "Create Reel", icon: <><rect x="2" y="4" width="20" height="16" rx="1" /><path d="M7 4l3 16M14 4l3 16M2 9h20M2 15h20" /></> },
  { group: "Content", to: "/app/scheduled", label: "Scheduled", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></> },
  { group: "Content", to: "/app/published", label: "Published", icon: <path d="M20 6L9 17l-5-5" /> },
  { group: "Content", to: "/app/failed", label: "Failed", icon: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></> },
  { group: "Manage", to: "/app/calendar", label: "Calendar", icon: <><rect x="3" y="4" width="18" height="18" rx="1" /><path d="M16 2v4M8 2v4M3 10h18" /></> },
  { group: "Manage", to: "/app/accounts", label: "Instagram Accounts", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></> },
  { group: "Manage", to: "/app/analytics", label: "Analytics", icon: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" /> },
  { group: "Manage", to: "/app/settings", label: "Settings", icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z" /></> },
];

export default function Sidebar({ open, onNavigate }) {
  const { logout } = useAuth();

  let lastGroup = undefined;

  return (
    <aside className={`sidebar ${open ? "open" : ""}`} id="sidebar">
      <div className="sidebar-top">
        <img src="/assets/logo.png" alt="Rush Republic" className="sidebar-logo" />
        <div className="sidebar-brand">RUSH REPUBLIC</div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const showLabel = item.group !== lastGroup;
          lastGroup = item.group;
          return (
            <div key={item.to}>
              {showLabel && item.group && <div className="nav-group-label">{item.group}</div>}
              <NavLink
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                onClick={onNavigate}
              >
                <svg viewBox="0 0 24 24">{item.icon}</svg>
                <span>{item.label}</span>
              </NavLink>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">A</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">Admin</div>
            <div className="sidebar-user-role">Rush Republic</div>
          </div>
        </div>
        <button className="sidebar-logout" onClick={logout}>Logout</button>
      </div>
    </aside>
  );
}
