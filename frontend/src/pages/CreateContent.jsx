import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { useModal } from "../context/ModalContext";
import { useToast } from "../context/ToastContext";
import { ApiError } from "../api/httpClient";
import { fileSize, formatDate, formatTime, zonedParts } from "../utils/format";

export default function CreateContent({ type }) {
  const isReel = type === "REEL";
  const accept = isReel ? "video/mp4,video/quicktime" : "image/jpeg,image/png,image/jpg";
  const navigate = useNavigate();
  const { accounts, settings, createPost, createReel } = useAppData();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();

  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [duration, setDuration] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const [account, setAccount] = useState("");
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [altText, setAltText] = useState("");
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [publishNow, setPublishNow] = useState(false);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Prefill account/schedule defaults once accounts + settings have loaded.
  useEffect(() => {
    if (accounts.length && !account) setAccount(String(accounts[0].id));
  }, [accounts, account]);

  useEffect(() => {
    if (settings) {
      const defaultTime = (settings.default_publish_time || "09:00").slice(0, 5);
      setTime(defaultTime);
      setTimezone(settings.default_timezone || "Asia/Kolkata");

      // If today + the default time has already passed, default to
      // tomorrow instead — otherwise the form silently pre-fills a
      // past timestamp the backend will reject as soon as the user submits.
      const nowLocal = new Date().toTimeString().slice(0, 5);
      if (defaultTime <= nowLocal) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setDate(tomorrow.toISOString().slice(0, 10));
      }
    }
  }, [settings]);

  // reset form state when switching between Create Post / Create Reel
  useEffect(() => {
    setFile(null); setPreviewUrl(null); setDuration(null);
    setCaption(""); setLocation(""); setFirstComment(""); setAltText("");
    setOptionalOpen(false); setPublishNow(false);
    setDate(today); setSubmitError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const removeMedia = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null); setDuration(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onVideoLoaded = (e) => {
    const dur = e.target.duration;
    const mm = Math.floor(dur / 60);
    const ss = Math.floor(dur % 60).toString().padStart(2, "0");
    setDuration(`${mm}:${ss}`);
  };

  const charCount = caption.length;

  const submit = async () => {
    setSubmitError(null);

    if (!file) {
      showToast(`Please upload ${isReel ? "a video" : "an image"} first.`);
      return;
    }
    if (!account) {
      showToast("Please select an Instagram account.");
      return;
    }
    if (!publishNow && (!date || !time)) {
      showToast("Please select a date and time.");
      return;
    }

    const payload = {
      instagram_account: account,
      caption,
      media: file,
      scheduled_at: publishNow ? `${today}T${new Date().toTimeString().slice(0, 5)}` : `${date}T${time}`,
      timezone,
      publish_now: publishNow,
    };

    setSubmitting(true);
    try {
      const record = isReel ? await createReel(payload) : await createPost(payload);
      showConfirmModal(record, publishNow);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to schedule content. Please try again.";
      setSubmitError(message);
      showToast(message);
    } finally {
      setSubmitting(false);
    }
  };

  const showConfirmModal = (record, wasPublishNow) => {
    openModal(
      <>
        <button className="modal-close" onClick={() => { closeModal(); navigate("/app/dashboard"); }}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="modal-icon"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></svg></div>
        <h3>{record.content_type} {wasPublishNow ? "Submitted" : "Scheduled"}</h3>
        <p>
          {wasPublishNow
            ? `Your ${record.content_type.toLowerCase()} has been queued for immediate publishing. Check Published/Failed shortly for the result.`
            : `Your Instagram ${record.content_type.toLowerCase()} has been scheduled successfully.`}
        </p>
        <div className="modal-detail-row"><span className="label">Account</span><span className="value">@{record.instagram_account.username}</span></div>
        <div className="modal-detail-row"><span className="label">Date</span><span className="value">{formatDate(zonedParts(record.scheduled_at, record.timezone).date)}</span></div>
        {!wasPublishNow && <div className="modal-detail-row"><span className="label">Time</span><span className="value">{formatTime(zonedParts(record.scheduled_at, record.timezone).time)}</span></div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => { closeModal(); navigate(wasPublishNow ? "/app/published" : "/app/scheduled"); }}>
            {wasPublishNow ? "View Published" : "View Schedule"}
          </button>
          <button className="btn btn-primary" onClick={() => { closeModal(); navigate("/app/dashboard"); }}>Done</button>
        </div>
      </>
    );
    showToast(wasPublishNow ? "Content submitted for publishing." : "Content scheduled successfully.");
  };

  const handleReset = () => {
    removeMedia();
    setCaption(""); setLocation(""); setFirstComment(""); setAltText("");
    setPublishNow(false); setDate(today); setSubmitError(null);
  };

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Create {isReel ? "Reel" : "Post"}</h2>
          <div className="view-subtitle">
            {isReel ? "Upload a video and schedule it to your Instagram Reels." : "Upload an image and schedule it to your Instagram feed."}
          </div>
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 32 }}>
          <h4>No Instagram account connected</h4>
          <p>Connect an Instagram Professional account before creating content.</p>
          <button className="btn btn-primary" onClick={() => navigate("/app/accounts")}>Go to Instagram Accounts</button>
        </div>
      )}

      <div className="create-layout">
        <div className="create-media-col">
          {!file ? (
            <div
              className={`upload-box ${dragOver ? "dragover" : ""}`}
              onClick={() => fileInputRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
            >
              <svg viewBox="0 0 24 24"><path d="M12 16V4M12 4l-5 5M12 4l5 5" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>
              <h4>Upload {isReel ? "Reel Video" : "Image"}</h4>
              <p>Drag &amp; drop your {isReel ? "video" : "image"} here</p>
              <div className="or">or</div>
              <span className="browse-link">Browse from computer</span>
              <div className="accept-types">{isReel ? "MP4 · MOV" : "JPG · JPEG · PNG"}</div>
            </div>
          ) : (
            <div className="media-preview-wrap">
              {isReel ? (
                <video src={previewUrl} className="media-preview" controls onLoadedMetadata={onVideoLoaded} />
              ) : (
                <img src={previewUrl} className="media-preview" alt="Preview" />
              )}
              <div className="media-meta-bar">
                <div className="media-meta-info">
                  <div className="media-meta-name">{file.name}</div>
                  <div className="media-meta-size">{fileSize(file.size)}{isReel ? ` · ${duration || "Loading duration..."}` : ""}</div>
                </div>
                <div className="media-meta-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current.click()}>Replace</button>
                  <button className="btn btn-danger btn-sm" onClick={removeMedia}>Remove</button>
                </div>
              </div>
            </div>
          )}
          <input
            type="file" ref={fileInputRef} accept={accept} className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>

        <div className="create-details-col">
          <div className="form-group">
            <label>Instagram Account</label>
            <select className="form-control" value={account} onChange={(e) => setAccount(e.target.value)} disabled={accounts.length === 0}>
              {accounts.length === 0 && <option value="">No accounts connected</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>@{a.username}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Caption</label>
            <textarea
              className="form-control" maxLength={2200} placeholder="Write a caption..."
              value={caption} onChange={(e) => setCaption(e.target.value)}
            />
            <div className={`char-counter ${charCount > 2000 ? "over" : ""}`}>Characters: {charCount} / 2200</div>
          </div>

          <div className={`collapsible-toggle ${optionalOpen ? "open" : ""}`} onClick={() => setOptionalOpen((v) => !v)}>
            <span>Additional Options</span>
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
          </div>
          <div className={`collapsible-body ${optionalOpen ? "open" : ""}`}>
            <div className="form-group">
              <label>Location <span className="optional">(optional)</span></label>
              <input type="text" className="form-control" placeholder="Add location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="form-group">
              <label>First Comment <span className="optional">(optional)</span></label>
              <input type="text" className="form-control" placeholder="Add a first comment" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Alt Text <span className="optional">(optional)</span></label>
              <input type="text" className="form-control" placeholder="Describe the media for accessibility" value={altText} onChange={(e) => setAltText(e.target.value)} />
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 8 }}>Publishing</div>
          <div className="publish-toggle">
            <button type="button" className={publishNow ? "active" : ""} onClick={() => setPublishNow(true)}>Publish Now</button>
            <button type="button" className={!publishNow ? "active" : ""} onClick={() => setPublishNow(false)}>Schedule</button>
          </div>

          <div className={`schedule-fields ${!publishNow ? "open" : ""}`}>
            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input type="date" className="form-control" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Time</label>
                <input type="time" className="form-control" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Timezone</label>
              <select className="form-control" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                <option value="Asia/Kolkata">Asia/Kolkata</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
              </select>
            </div>
          </div>

          {submitError && <div className="login-error" style={{ marginBottom: 16 }}>{submitError}</div>}

          <div className="create-actions">
            <button className="btn btn-primary" onClick={submit} disabled={submitting || accounts.length === 0}>
              {submitting ? "Uploading..." : `Schedule ${isReel ? "Reel" : "Post"}`}
            </button>
            <button className="btn btn-ghost" onClick={handleReset} disabled={submitting}>Reset</button>
          </div>
        </div>
      </div>
    </>
  );
}
