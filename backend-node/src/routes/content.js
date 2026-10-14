const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const env = require("../config/env");
const { query } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { wrap, ApiError, notFound } = require("../lib/errors");
const { CONTENT_SELECT, CONTENT_FROM, contentOut } = require("../lib/serializers");
const { isValidZone, parseWallClock, parseInstant, toDb, nowDb } = require("../lib/dates");
const { validateMediaFile, MAX_VIDEO_SIZE_BYTES } = require("../lib/mediaValidation");
const { saveUpload } = require("../lib/mediaStorage");
const { publishScheduledContent } = require("../services/publisher");

const router = express.Router();
router.use(authenticate);

const tmpDir = path.join(env.mediaRoot, ".tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({ dest: tmpDir, limits: { fileSize: MAX_VIDEO_SIZE_BYTES + 1 } });

const fetchContent = async (where, params, tail = "") =>
  query(`SELECT ${CONTENT_SELECT} ${CONTENT_FROM} WHERE ${where} ${tail}`, params);

async function loadOwned(id, userId) {
  const rows = await fetchContent("c.id = ? AND c.user_id = ?", [id, userId]);
  if (!rows.length) throw notFound();
  return rows[0];
}

/** Fire-and-forget immediate publish; the atomic claim makes a duplicate attempt harmless. */
function kick(id) {
  setImmediate(() => publishScheduledContent(id).catch((e) => console.error(`content_id=${id} publish crashed:`, e)));
}

// ---- GET /api/content/?status=&content_type=&account=&search=
router.get("/content/", wrap(async (req, res) => {
  let where = "c.user_id = ?";
  const params = [req.user.id];
  const { status, content_type, account, search } = req.query;
  if (status) { where += " AND c.status = ?"; params.push(String(status).toUpperCase()); }
  if (content_type) { where += " AND c.content_type = ?"; params.push(String(content_type).toUpperCase()); }
  if (account) { where += " AND a.username = ?"; params.push(String(account).replace(/^@+/, "")); }
  if (search) {
    const like = `%${String(search).replace(/[\\%_]/g, "\\$&")}%`;
    where += " AND (c.caption LIKE ? OR a.username LIKE ?)";
    params.push(like, like);
  }
  const rows = await fetchContent(where, params, "ORDER BY c.scheduled_at DESC");
  res.json(rows.map((r) => contentOut(r, req)));
}));

const BOOL_TRUE = ["true", "True", "TRUE", "t", "T", "y", "Y", "yes", "Yes", "YES", "on", "On", "ON", "1", 1, true];
const BOOL_FALSE = ["false", "False", "FALSE", "f", "F", "n", "N", "no", "No", "NO", "off", "Off", "OFF", "0", 0, false];

// ---- POST /api/content/ (multipart/form-data)
router.post("/content/", upload.single("media"), wrap(async (req, res) => {
  const file = req.file;
  const cleanup = () => file && fs.promises.unlink(file.path).catch(() => {});
  try {
    const b = req.body || {};
    const errors = {};
    const req_ = (f) => (errors[f] = ["This field is required."]);

    // instagram_account (must belong to the user and be active)
    let account = null;
    if (b.instagram_account === undefined || b.instagram_account === "") req_("instagram_account");
    else if (!/^\d+$/.test(String(b.instagram_account))) {
      errors.instagram_account = [`Incorrect type. Expected pk value, received ${typeof b.instagram_account === "string" ? "str" : typeof b.instagram_account}.`];
    } else {
      const rows = await query(
        "SELECT id FROM instagram_accounts_instagramaccount WHERE id = ? AND user_id = ? AND is_active = 1",
        [b.instagram_account, req.user.id]
      );
      if (!rows.length) errors.instagram_account = [`Invalid pk "${b.instagram_account}" - object does not exist.`];
      else account = rows[0];
    }

    const contentType = b.content_type;
    if (contentType === undefined) req_("content_type");
    else if (contentType === "") errors.content_type = ['"" is not a valid choice.'];
    else if (!["POST", "REEL"].includes(contentType)) errors.content_type = [`"${contentType}" is not a valid choice.`];

    const caption = b.caption === undefined ? "" : String(b.caption);
    if (caption.length > 2200) errors.caption = ["Ensure this field has no more than 2200 characters."];

    if (!file) errors.media = ["No file was submitted."];

    if (b.scheduled_at === undefined) req_("scheduled_at");
    else if (String(b.scheduled_at) === "") errors.scheduled_at = ["This field may not be blank."];

    const tz = b.timezone === undefined ? "Asia/Kolkata" : String(b.timezone);
    if (tz === "") errors.timezone = ["This field may not be blank."];
    else if (tz.length > 64) errors.timezone = ["Ensure this field has no more than 64 characters."];
    else if (!isValidZone(tz)) errors.timezone = [`Unknown timezone '${tz}'.`];

    let publishNow = false;
    if (b.publish_now !== undefined) {
      if (BOOL_TRUE.includes(b.publish_now)) publishNow = true;
      else if (BOOL_FALSE.includes(b.publish_now)) publishNow = false;
      else errors.publish_now = [`"${b.publish_now}" is not a valid boolean.`];
    }
    if (Object.keys(errors).length) throw new ApiError(400, errors);

    // Cross-field validation (DRF validate()).
    const when = parseWallClock(b.scheduled_at, tz);
    if (!when) throw new ApiError(400, { scheduled_at: ["Invalid date/time format."] });
    if (!publishNow && when.getTime() <= Date.now()) {
      throw new ApiError(400, { scheduled_at: ["Scheduled time must be in the future."] });
    }
    // multer decodes filenames as latin1; browsers send UTF-8.
    const originalName = path.basename(Buffer.from(file.originalname, "latin1").toString("utf8"));
    const mediaErr = validateMediaFile({ ...file, originalname: originalName }, contentType);
    if (mediaErr) throw new ApiError(400, { media: [mediaErr] });

    const rel = await saveUpload(file.path, originalName, req.user.id);
    const now = nowDb();
    const media = await query("INSERT INTO scheduler_mediafile SET ?", [{
      uploaded_by_id: req.user.id,
      file: rel,
      kind: contentType === "POST" ? "IMAGE" : "VIDEO",
      original_filename: originalName.slice(0, 255),
      size_bytes: file.size,
      created_at: now,
    }]);
    const ins = await query("INSERT INTO scheduler_scheduledcontent SET ?", [{
      user_id: req.user.id,
      instagram_account_id: account.id,
      content_type: contentType,
      caption,
      media_id: media.insertId,
      scheduled_at: publishNow ? now : toDb(when),
      timezone: tz,
      status: "SCHEDULED",
      celery_task_id: "",
      meta_container_id: "",
      instagram_media_id: "",
      instagram_permalink: "",
      failure_reason: "",
      created_at: now,
      updated_at: now,
    }]);

    // Scheduled items are picked up by the poller/cron once due; publish-now starts immediately.
    if (publishNow) kick(ins.insertId);

    res.status(201).json(contentOut(await loadOwned(ins.insertId, req.user.id), req));
  } catch (err) {
    // Validation failed before the file was stored — don't leave the temp upload behind.
    if (file && fs.existsSync(file.path)) await cleanup();
    throw err;
  }
}));

// ---- GET/PATCH /api/content/:id/  (edit only while SCHEDULED)
router.get("/content/:pk(\\d+)/", wrap(async (req, res) => {
  res.json(contentOut(await loadOwned(req.params.pk, req.user.id), req));
}));

router.patch("/content/:pk(\\d+)/", upload.none(), wrap(async (req, res) => {
  const c = await loadOwned(req.params.pk, req.user.id);
  if (c.status !== "SCHEDULED") {
    throw new ApiError(409, { detail: `Cannot edit content with status ${c.status}.` });
  }
  const b = req.body || {};
  const updates = {};
  if (b.caption !== undefined && b.caption !== null) updates.caption = String(b.caption);
  if (b.scheduled_at) {
    const parsed = parseInstant(b.scheduled_at);
    if (!parsed) throw new ApiError(400, { scheduled_at: "Invalid datetime." });
    if (parsed.getTime() <= Date.now()) throw new ApiError(400, { scheduled_at: "Scheduled time must be in the future." });
    updates.scheduled_at = toDb(parsed);
  }
  if (b.timezone) updates.timezone = String(b.timezone);

  updates.updated_at = nowDb();
  // Guarded on status so a concurrent claim by the scheduler is never overwritten.
  const r = await query("UPDATE scheduler_scheduledcontent SET ? WHERE id = ? AND status = 'SCHEDULED'", [updates, c.id]);
  if (r.affectedRows !== 1) throw new ApiError(409, { detail: "Cannot edit content that is already being processed." });
  res.json(contentOut(await loadOwned(c.id, req.user.id), req));
}));

// ---- DELETE /api/content/:id/  (not while PROCESSING; published items are kept)
router.delete("/content/:pk(\\d+)/", wrap(async (req, res) => {
  const c = await loadOwned(req.params.pk, req.user.id);
  const r = await query(
    "DELETE FROM scheduler_scheduledcontent WHERE id = ? AND status IN ('FAILED','SCHEDULED','CANCELLED','DRAFT')",
    [c.id]
  );
  if (r.affectedRows !== 1) {
    throw new ApiError(409, { detail: `Cannot delete content with status ${c.status}.` });
  }
  // Drop the uploaded file too, unless another item still uses it.
  const used = await query("SELECT 1 FROM scheduler_scheduledcontent WHERE media_id = ? LIMIT 1", [c.media_id]);
  if (!used.length) {
    await query("DELETE FROM scheduler_mediafile WHERE id = ?", [c.media_id]);
    const abs = path.resolve(env.mediaRoot, c.m_file);
    if (abs.startsWith(env.mediaRoot + path.sep)) await fs.promises.unlink(abs).catch(() => {});
  }
  res.status(204).end();
}));

// ---- POST /api/content/:id/cancel/
router.post("/content/:pk(\\d+)/cancel/", wrap(async (req, res) => {
  const c = await loadOwned(req.params.pk, req.user.id);
  if (!["SCHEDULED", "DRAFT"].includes(c.status)) {
    throw new ApiError(409, { detail: `Cannot cancel content with status ${c.status}.` });
  }
  // Atomic against the scheduler's SCHEDULED -> PROCESSING claim.
  const r = await query(
    "UPDATE scheduler_scheduledcontent SET status='CANCELLED', updated_at=? WHERE id=? AND status IN ('SCHEDULED','DRAFT')",
    [nowDb(), c.id]
  );
  if (r.affectedRows !== 1) throw new ApiError(409, { detail: "Cannot cancel content that is already being processed." });
  res.json(contentOut(await loadOwned(c.id, req.user.id), req));
}));

// ---- POST /api/content/:id/retry/
router.post("/content/:pk(\\d+)/retry/", wrap(async (req, res) => {
  const c = await loadOwned(req.params.pk, req.user.id);
  if (c.status !== "FAILED") {
    throw new ApiError(409, { detail: `Can only retry FAILED content (current status: ${c.status}).` });
  }
  if (c.instagram_media_id) {
    // Meta already accepted a publish for this content — never publish it again.
    await query("UPDATE scheduler_scheduledcontent SET status='PUBLISHED', updated_at=? WHERE id=?", [nowDb(), c.id]);
    return res.json(contentOut(await loadOwned(c.id, req.user.id), req));
  }
  const r = await query(
    `UPDATE scheduler_scheduledcontent SET status='SCHEDULED', failure_reason='', failed_at=NULL, updated_at=?
      WHERE id=? AND status='FAILED'`,
    [nowDb(), c.id]
  );
  if (r.affectedRows === 1) kick(c.id);
  res.json(contentOut(await loadOwned(c.id, req.user.id), req));
}));

// ---- GET /api/dashboard/
router.get("/dashboard/", wrap(async (req, res) => {
  const counts = await query(
    "SELECT status, COUNT(*) AS n FROM scheduler_scheduledcontent WHERE user_id = ? GROUP BY status",
    [req.user.id]
  );
  const n = (s) => Number(counts.find((r) => r.status === s)?.n || 0);
  const accounts = await query(
    "SELECT COUNT(*) AS n FROM instagram_accounts_instagramaccount WHERE user_id = ? AND is_active = 1",
    [req.user.id]
  );
  const upcoming = await fetchContent("c.user_id = ? AND c.status = 'SCHEDULED'", [req.user.id], "ORDER BY c.scheduled_at ASC LIMIT 4");
  res.json({
    scheduled_count: n("SCHEDULED"),
    published_count: n("PUBLISHED"),
    failed_count: n("FAILED"),
    connected_accounts_count: Number(accounts[0].n),
    upcoming_content: upcoming.map((r) => contentOut(r, req)),
  });
}));

// ---- GET /api/calendar/?start_date=&end_date=&account=
router.get("/calendar/", wrap(async (req, res) => {
  let where = "c.user_id = ?";
  const params = [req.user.id];
  const { start_date, end_date, account } = req.query;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  for (const [name, val, op] of [["start_date", start_date, ">="], ["end_date", end_date, "<="]]) {
    if (!val) continue;
    if (!DATE_RE.test(String(val))) throw new ApiError(400, { [name]: ["Enter a valid date."] });
    where += ` AND DATE(c.scheduled_at) ${op} ?`;
    params.push(val);
  }
  if (account) { where += " AND a.username = ?"; params.push(String(account).replace(/^@+/, "")); }
  const rows = await fetchContent(where, params, "ORDER BY c.scheduled_at DESC");
  res.json(rows.map((r) => contentOut(r, req)));
}));

module.exports = router;
