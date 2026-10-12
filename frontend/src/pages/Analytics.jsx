import { useAppData } from "../context/AppDataContext";
import { analyticsApi } from "../api/analyticsApi";
import { useApiData } from "../hooks/useApiData";
import { LoadingState, ErrorState } from "../components/ApiState";
import EmptyState from "../components/EmptyState";
import { formatDate } from "../utils/format";

const METRIC_LABELS = [
  ["reach", "Reach"], ["impressions", "Impressions"], ["likes", "Likes"],
  ["comments", "Comments"], ["shares", "Shares"], ["saves", "Saves"], ["plays", "Plays"],
];

const SOURCE_LABEL = {
  META_API: "LIVE FROM META",
  CACHED: "CACHED (LAST FETCH)",
  UNAVAILABLE: "NO DATA AVAILABLE",
};

export default function Analytics() {
  const { accounts, activeAccount, setActiveAccount } = useAppData();
  const { data, loading, error, refresh } = useApiData(
    () => analyticsApi.get(activeAccount),
    [activeAccount]
  );

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Instagram Analytics</h2>
          <div className="view-subtitle">
            Real Meta Graph API insights for published content. Items that haven't
            published yet, or where Meta returns an error, are explicitly marked
            "No data available" — nothing here is estimated or invented.
          </div>
        </div>
      </div>

      <div className="analytics-toolbar">
        <select className="select-filter" value={activeAccount} onChange={(e) => setActiveAccount(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={`@${a.username}`}>@{a.username}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingState label="Loading analytics..." />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !data || data.results.length === 0 ? (
        <EmptyState title="No published content yet" desc="Analytics appear here once content has been published to this account." />
      ) : (
        <div className="content-list">
          {data.results.map((entry) => (
            <div className="content-row" key={entry.content_id}>
              <div className="content-info">
                <div className="content-info-top">
                  <span className={`tag ${entry.content_type === "POST" ? "tag-post" : "tag-reel"}`}>{entry.content_type}</span>
                  <span className="content-account">{entry.instagram_media_id || `content #${entry.content_id}`}</span>
                </div>
                <div className="content-meta">
                  <span>Published <strong>{entry.published_at ? formatDate(entry.published_at.slice(0, 10)) : "—"}</strong></span>
                </div>
                {entry.source === "UNAVAILABLE" ? (
                  <div className="content-caption" style={{ marginTop: 8 }}>{entry.reason || "No data available."}</div>
                ) : (
                  <div className="content-meta" style={{ marginTop: 8, flexWrap: "wrap" }}>
                    {METRIC_LABELS.filter(([key]) => entry.metrics[key] !== null && entry.metrics[key] !== undefined).map(([key, label]) => (
                      <span key={key}>{label}: <strong>{entry.metrics[key]}</strong></span>
                    ))}
                  </div>
                )}
              </div>
              <div className="content-actions">
                <span className="status-pill">{SOURCE_LABEL[entry.source]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
