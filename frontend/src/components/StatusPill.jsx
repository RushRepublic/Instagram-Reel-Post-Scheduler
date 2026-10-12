const CLASS_MAP = {
  SCHEDULED: "status-scheduled",
  PUBLISHED: "status-published",
  FAILED: "status-failed",
  // Account connection status (Instagram Accounts page) reuses the same
  // visual language — green/red — but with its own labels, since
  // "published" has no meaning for an account, only for content.
  CONNECTED: "status-published",
  DISCONNECTED: "status-failed",
};

export default function StatusPill({ status }) {
  return <span className={`status-pill ${CLASS_MAP[status] || ""}`}>{status}</span>;
}
