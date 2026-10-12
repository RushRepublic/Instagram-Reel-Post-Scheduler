import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { useToast } from "../context/ToastContext";
import { LoadingState, ErrorState } from "../components/ApiState";
import EmptyState from "../components/EmptyState";
import StatusPill from "../components/StatusPill";
import { ApiError } from "../api/httpClient";

export default function Accounts() {
  const { accounts, accountsLoading, accountsError, refreshAccounts, connectAccount, setActiveAccount } = useAppData();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [skippedPages, setSkippedPages] = useState(null);

  // Land here after the Facebook OAuth redirect completes on the backend.
  useEffect(() => {
    const connectedCount = searchParams.get("connected_count");
    const connectError = searchParams.get("connect_error");
    const skippedNames = searchParams.get("skipped_names");

    if (connectedCount !== null) {
      const n = Number(connectedCount);
      showToast(n > 0 ? `Connected ${n} Instagram account${n === 1 ? "" : "s"}.` : "No Instagram Business accounts found on your Pages.");
      if (skippedNames) setSkippedPages(skippedNames.split(","));
      refreshAccounts();
      setSearchParams({}, { replace: true });
    } else if (connectError) {
      showToast(`Connection failed: ${connectError.replace(/_/g, " ")}`);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [connecting, setConnecting] = useState(false);

  const openConnectModal = async () => {
    // connectAccount() navigates the whole browser to Facebook's OAuth
    // dialog on success — the page unloads, so we never reach the "finally"
    // in that case. If the backend rejects the request first (e.g. Meta
    // credentials not configured yet), surface that instead of failing silently.
    setConnecting(true);
    try {
      await connectAccount();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not start the Instagram connection. Please try again.";
      showToast(message);
      setConnecting(false);
    }
  };

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Instagram Accounts</h2>
          <div className="view-subtitle">Manage the accounts connected to Rush Republic.</div>
        </div>
        <div className="view-header-actions">
          <button className="btn btn-primary" onClick={openConnectModal} disabled={connecting}>
            {connecting ? "Connecting..." : "+ Connect Instagram Account"}
          </button>
        </div>
      </div>

      {skippedPages && skippedPages.length > 0 && (
        <div className="empty-state" style={{ textAlign: "left", marginBottom: 32 }}>
          <h4>{skippedPages.length} Page{skippedPages.length === 1 ? "" : "s"} skipped — no Instagram account linked</h4>
          <p>
            These Facebook Pages don't have an Instagram Professional (Business/Creator) account
            linked to them, so there's nothing to connect. Link Instagram to a Page in Facebook's
            Page Settings, then reconnect, if you want one of these to show up here.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {skippedPages.map((name) => (
              <span key={name} className="tag tag-reel">{name}</span>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 16 }} onClick={() => setSkippedPages(null)}>
            Dismiss
          </button>
        </div>
      )}

      {accountsLoading ? (
        <LoadingState label="Loading connected accounts..." />
      ) : accountsError ? (
        <ErrorState message={accountsError} onRetry={refreshAccounts} />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="No Instagram accounts connected"
          desc="Connect a Facebook Page with a linked Instagram Professional account to start scheduling."
          action={<button className="btn btn-primary" onClick={openConnectModal} disabled={connecting}>{connecting ? "Connecting..." : "Connect Instagram Account"}</button>}
        />
      ) : (
        <div className="accounts-grid">
          {accounts.map((a) => (
            <div className="account-card" key={a.id}>
              <div className="account-card-top">
                {a.profile_picture_url ? (
                  <img className="account-avatar" src={a.profile_picture_url} alt="" style={{ objectFit: "cover" }} />
                ) : (
                  <div className="account-avatar">{a.username.charAt(0).toUpperCase()}</div>
                )}
                <div>
                  <div className="account-handle">@{a.username}</div>
                  <div className="account-name">{a.display_name || a.account_type}</div>
                </div>
              </div>
              <div><StatusPill status={a.is_active ? "CONNECTED" : "DISCONNECTED"} /></div>
              <button className="btn btn-ghost btn-sm" onClick={() => setActiveAccount(`@${a.username}`)}>View Account</button>
            </div>
          ))}

          <button className="connect-account-card" onClick={openConnectModal} disabled={connecting}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            <span>{connecting ? "Connecting..." : "Connect Instagram Account"}</span>
          </button>
        </div>
      )}
    </>
  );
}
