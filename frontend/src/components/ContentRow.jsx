import StatusPill from "./StatusPill";
import { formatDate, formatTime } from "../utils/format";

export default function ContentRow({ item, actions }) {
  const isVideo = item.mediaKind === "video";

  return (
    <div className="content-row">
      <div className="content-thumb">
        {item.mediaDataUrl ? (
          isVideo ? <video src={item.mediaDataUrl} muted /> : <img src={item.mediaDataUrl} alt="" />
        ) : (
          <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, color: "#ccc" }}>
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        )}
        <div className="content-type-badge">{item.type}</div>
      </div>

      <div className="content-info">
        <div className="content-info-top">
          <span className={`tag ${item.type === "POST" ? "tag-post" : "tag-reel"}`}>{item.type}</span>
          <span className="content-account">{item.account}</span>
        </div>
        <div className="content-caption">{item.caption || "(no caption)"}</div>
        <div className="content-meta">
          {item.status === "PUBLISHED" ? (
            <span>Published <strong>{formatDate(item.publishedDate || item.scheduledDate)}</strong></span>
          ) : (
            <>
              <span><strong>{formatDate(item.scheduledDate)}</strong></span>
              <span><strong>{formatTime(item.scheduledTime)}</strong></span>
            </>
          )}
          {item.status === "FAILED" && (
            <span>Reason: <strong>{item.failReason || "Unknown error"}</strong></span>
          )}
        </div>
      </div>

      <div className="content-actions">
        <StatusPill status={item.status} />
        {actions}
      </div>
    </div>
  );
}
