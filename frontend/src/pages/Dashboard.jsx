import { useNavigate } from "react-router-dom";
import { dashboardApi } from "../api/dashboardApi";
import { useApiData } from "../hooks/useApiData";
import ContentRow from "../components/ContentRow";
import EmptyState from "../components/EmptyState";
import { LoadingState, ErrorState } from "../components/ApiState";
import { dayPart } from "../utils/format";
import { adaptContent } from "../utils/adaptContent";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useApiData(() => dashboardApi.get(), []);

  return (
    <>
      <div className="dash-greeting">
        <h2>Good {dayPart()}, <span className="rr-script">Admin</span></h2>
        <p>Manage and schedule your Instagram content.</p>
      </div>

      {loading ? (
        <LoadingState label="Loading dashboard..." />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Scheduled</div><div className="stat-value">{data.scheduled_count}</div></div>
            <div className="stat-card"><div className="stat-label">Published</div><div className="stat-value">{data.published_count}</div></div>
            <div className="stat-card"><div className="stat-label">Failed</div><div className="stat-value">{data.failed_count}</div></div>
            <div className="stat-card"><div className="stat-label">Connected Accounts</div><div className="stat-value">{data.connected_accounts_count}</div></div>
          </div>

          <div className="section-title">Quick Actions</div>
          <div className="quick-actions">
            <button className="quick-action-btn" onClick={() => navigate("/app/create-post")}>
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              <span>Create Post</span>
            </button>
            <button className="quick-action-btn" onClick={() => navigate("/app/create-reel")}>
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              <span>Create Reel</span>
            </button>
            <button className="quick-action-btn" onClick={() => navigate("/app/calendar")}>
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="1" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              <span>View Calendar</span>
            </button>
            <button className="quick-action-btn" onClick={() => navigate("/app/accounts")}>
              <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
              <span>Connect Account</span>
            </button>
          </div>

          <div className="section-title">Upcoming Content</div>
          {data.upcoming_content.length ? (
            <div className="content-list">
              {data.upcoming_content.map((item) => (
                <ContentRow
                  key={item.id}
                  item={adaptContent(item)}
                  actions={<button className="btn btn-ghost btn-sm" onClick={() => navigate("/app/scheduled")}>View</button>}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing scheduled yet" desc="Create your first post or reel to see it here." />
          )}
        </>
      )}
    </>
  );
}
