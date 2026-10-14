import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { contentApi } from "../api/contentApi";
import { useApiData } from "../hooks/useApiData";
import { useModal } from "../context/ModalContext";
import { useToast } from "../context/ToastContext";
import ContentRow from "../components/ContentRow";
import EmptyState from "../components/EmptyState";
import { LoadingState, ErrorState } from "../components/ApiState";
import { adaptContent } from "../utils/adaptContent";
import { formatDate, formatTime } from "../utils/format";
import { ApiError } from "../api/httpClient";

export default function ContentListPage({ title, subtitle, status, emptyTitle, emptyDesc, kind }) {
  const { data, loading, error, refresh } = useApiData(() => contentApi.list({ status }), [status]);
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState(null);

  const items = useMemo(() => (data || []).map(adaptContent), [data]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter !== "ALL") list = list.filter((i) => i.type === filter);
    if (search) {
      const t = search.toLowerCase();
      list = list.filter((i) => (i.caption || "").toLowerCase().includes(t) || i.account.toLowerCase().includes(t));
    }
    return list;
  }, [items, filter, search]);

  const viewModal = (item) => {
    openModal(
      <>
        <button className="modal-close" onClick={closeModal}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className={`tag ${item.type === "POST" ? "tag-post" : "tag-reel"}`} style={{ marginBottom: 14, display: "inline-block" }}>{item.type}</div>
        <h3>{item.account}</h3>
        <p>{item.caption || "(no caption)"}</p>
        <div className="modal-detail-row"><span className="label">Status</span><span className="value">{item.status}</span></div>
        <div className="modal-detail-row"><span className="label">Date</span><span className="value">{formatDate(item.scheduledDate)}</span></div>
        <div className="modal-detail-row"><span className="label">Time</span><span className="value">{formatTime(item.scheduledTime)}</span></div>
        <div className="modal-detail-row"><span className="label">Timezone</span><span className="value">{item.timezone || "—"}</span></div>
        {item.instagram_media_id && (
          <div className="modal-detail-row"><span className="label">Media ID</span><span className="value">{item.instagram_media_id}</span></div>
        )}
        {item.instagram_permalink && (
          <div className="modal-detail-row">
            <span className="label">Permalink</span>
            <span className="value"><a href={item.instagram_permalink} target="_blank" rel="noreferrer">View on Instagram</a></span>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-primary btn-block" onClick={closeModal}>Close</button>
        </div>
      </>
    );
  };

  const errorModal = (item) => {
    openModal(
      <>
        <button className="modal-close" onClick={closeModal}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="modal-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg></div>
        <h3>Publish Failed</h3>
        <p>{item.failReason || "An unknown error occurred while publishing this content."}</p>
        <div className="modal-detail-row"><span className="label">Account</span><span className="value">{item.account}</span></div>
        <div className="modal-detail-row"><span className="label">Scheduled</span><span className="value">{formatDate(item.scheduledDate)} — {formatTime(item.scheduledTime)}</span></div>
        <div className="modal-actions">
          <button className="btn btn-primary btn-block" onClick={closeModal}>Close</button>
        </div>
      </>
    );
  };

  const runAction = async (fn, successMessage) => {
    setActionError(null);
    try {
      await fn();
      showToast(successMessage);
      refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Action failed. Please try again.";
      setActionError(message);
      showToast(message);
    }
  };

  const cancelModal = (item) => {
    openModal(
      <>
        <div className="modal-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg></div>
        <h3>Cancel Schedule?</h3>
        <p>Are you sure you want to cancel this scheduled content? This action cannot be undone.</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={closeModal}>Keep Schedule</button>
          <button
            className="btn btn-danger"
            onClick={() => { closeModal(); runAction(() => contentApi.cancel(item.id), "Scheduled content cancelled."); }}
          >
            Cancel Schedule
          </button>
        </div>
      </>
    );
  };

  const deleteModal = (item) => {
    openModal(
      <>
        <div className="modal-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg></div>
        <h3>Delete {item.type === "REEL" ? "Reel" : "Post"}?</h3>
        <p>This permanently removes this content and its uploaded media. This action cannot be undone.</p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={closeModal}>Keep</button>
          <button
            className="btn btn-danger"
            onClick={() => { closeModal(); runAction(() => contentApi.remove(item.id), "Content deleted."); }}
          >
            Delete
          </button>
        </div>
      </>
    );
  };

  const rowActions = (item) => {
    if (kind === "scheduled") {
      return (
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => viewModal(item)}>View</button>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(item.type === "REEL" ? "/app/create-reel" : "/app/create-post")}>Edit</button>
          <button className="btn btn-danger btn-sm" onClick={() => cancelModal(item)}>Cancel</button>
        </>
      );
    }
    if (kind === "published") {
      return (
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => viewModal(item)}>View</button>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/app/analytics")}>Analytics</button>
        </>
      );
    }
    return (
      <>
        <button className="btn btn-ghost btn-sm" onClick={() => errorModal(item)}>View Error</button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => runAction(() => contentApi.retry(item.id), "Retry initiated — content moved back to Scheduled.")}
        >
          Retry
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(item.type === "REEL" ? "/app/create-reel" : "/app/create-post")}>Edit</button>
        <button className="btn btn-danger btn-sm" onClick={() => deleteModal(item)}>Delete</button>
      </>
    );
  };

  return (
    <>
      <div className="view-header">
        <div>
          <h2>{title}</h2>
          <div className="view-subtitle">{subtitle}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filter-group">
          <button className={`filter-btn ${filter === "ALL" ? "active" : ""}`} onClick={() => setFilter("ALL")}>All</button>
          <button className={`filter-btn ${filter === "POST" ? "active" : ""}`} onClick={() => setFilter("POST")}>Posts</button>
          <button className={`filter-btn ${filter === "REEL" ? "active" : ""}`} onClick={() => setFilter("REEL")}>Reels</button>
        </div>
        <div className="search-box">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input type="text" placeholder="Search content..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {actionError && <ErrorState message={actionError} />}

      {loading ? (
        <LoadingState label={`Loading ${title.toLowerCase()}...`} />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : filtered.length ? (
        <div className="content-list">
          {filtered.map((item) => (
            <ContentRow key={item.id} item={item} actions={rowActions(item)} />
          ))}
        </div>
      ) : (
        <EmptyState title={emptyTitle} desc={emptyDesc} />
      )}
    </>
  );
}
