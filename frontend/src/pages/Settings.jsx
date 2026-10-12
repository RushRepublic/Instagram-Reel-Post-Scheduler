import { useState, useEffect } from "react";
import { useAppData } from "../context/AppDataContext";
import { useToast } from "../context/ToastContext";
import { LoadingState } from "../components/ApiState";
import StatusPill from "../components/StatusPill";
import { ApiError } from "../api/httpClient";

export default function Settings() {
  const { settings, accounts, updateSettings } = useAppData();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setName(settings.name || "");
    setEmail(settings.email || "");
    setTimezone(settings.default_timezone || "Asia/Kolkata");
    setTime((settings.default_publish_time || "09:00").slice(0, 5));
  }, [settings]);

  if (!settings) {
    return (
      <>
        <div className="view-header">
          <div>
            <h2>Settings</h2>
            <div className="view-subtitle">Manage your account, connections and preferences.</div>
          </div>
        </div>
        <LoadingState label="Loading settings..." />
      </>
    );
  }

  const save = async (patch, successMessage) => {
    setSaving(true);
    try {
      await updateSettings(patch);
      showToast(successMessage);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const toggleNotify = (key) => save({ [key]: !settings[key] }, "Notification preference updated.");

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Settings</h2>
          <div className="view-subtitle">Manage your account, connections and preferences.</div>
        </div>
      </div>

      <div className="settings-section">
        <h3>Account</h3>
        <div className="form-group"><label>Name</label><input type="text" className="form-control" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="form-group"><label>Email</label><input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <button className="btn btn-primary" disabled={saving} onClick={() => save({ first_name: name, email }, "Account settings saved.")}>
          Save Changes
        </button>
      </div>

      <div className="settings-section">
        <h3>Instagram</h3>
        {accounts.length === 0 ? (
          <p style={{ color: "var(--gray-500)", fontSize: 13.5 }}>No accounts connected yet — see the Instagram Accounts page.</p>
        ) : (
          accounts.map((a) => (
            <div className="settings-row" key={a.id}>
              <div><div className="settings-row-label">@{a.username}</div><div className="settings-row-desc">{a.display_name}</div></div>
              <StatusPill status={a.is_active ? "CONNECTED" : "DISCONNECTED"} />
            </div>
          ))
        )}
      </div>

      <div className="settings-section">
        <h3>Scheduling</h3>
        <div className="form-row">
          <div className="form-group">
            <label>Default Timezone</label>
            <select className="form-control" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="America/New_York">America/New_York</option>
              <option value="Europe/London">Europe/London</option>
              <option value="Asia/Dubai">Asia/Dubai</option>
            </select>
          </div>
          <div className="form-group">
            <label>Default Publishing Time</label>
            <input type="time" className="form-control" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <button
          className="btn btn-primary"
          disabled={saving}
          onClick={() => save({ default_timezone: timezone, default_publish_time: time }, "Scheduling preferences saved.")}
        >
          Save Preferences
        </button>
      </div>

      <div className="settings-section">
        <h3>Notifications</h3>
        <div className="settings-row">
          <div><div className="settings-row-label">Scheduled Successfully</div><div className="settings-row-desc">Get notified when content is scheduled.</div></div>
          <div className={`toggle-switch ${settings.notify_scheduled ? "on" : ""}`} onClick={() => toggleNotify("notify_scheduled")}><div className="knob"></div></div>
        </div>
        <div className="settings-row">
          <div><div className="settings-row-label">Publishing Failed</div><div className="settings-row-desc">Get notified when content fails to publish.</div></div>
          <div className={`toggle-switch ${settings.notify_failed ? "on" : ""}`} onClick={() => toggleNotify("notify_failed")}><div className="knob"></div></div>
        </div>
        <div className="settings-row">
          <div><div className="settings-row-label">Content Published</div><div className="settings-row-desc">Get notified when content goes live.</div></div>
          <div className={`toggle-switch ${settings.notify_published ? "on" : ""}`} onClick={() => toggleNotify("notify_published")}><div className="knob"></div></div>
        </div>
      </div>
    </>
  );
}
