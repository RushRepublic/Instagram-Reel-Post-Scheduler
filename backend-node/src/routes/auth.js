const express = require("express");
const { query } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { wrap, ApiError } = require("../lib/errors");
const password = require("../lib/djangoPassword");
const tokens = require("../lib/tokens");
const { userOut, settingsOut } = require("../lib/serializers");
const { nowDb } = require("../lib/dates");

const router = express.Router();
const body = (req) => req.body || {};
const required = (field) => new ApiError(400, { [field]: ["This field is required."] });

// POST /api/auth/login/
router.post("/login/", wrap(async (req, res) => {
  const email = String(body(req).email || "").trim();
  const pw = String(body(req).password || "");
  if (!email || !pw) throw new ApiError(400, { detail: "Email and password are required." });

  // Users are provisioned with username == email.
  const rows = await query("SELECT * FROM auth_user WHERE username = ? LIMIT 1", [email]);
  const user = rows[0];
  if (!user || !user.is_active || !password.verify(pw, user.password)) {
    throw new ApiError(401, { detail: "Invalid email or password." });
  }
  await query("UPDATE auth_user SET last_login = ? WHERE id = ?", [nowDb(), user.id]);

  res.json({
    access: tokens.createAccess(user.id),
    refresh: await tokens.createRefresh(user.id),
    user: userOut(user),
  });
}));

// POST /api/auth/refresh/  (simplejwt TokenRefreshView, ROTATE_REFRESH_TOKENS=True)
router.post("/refresh/", wrap(async (req, res) => {
  const refresh = body(req).refresh;
  if (!refresh) throw required("refresh");
  const invalid = new ApiError(401, { detail: "Token is invalid or expired", code: "token_not_valid" });
  const payload = tokens.verify(refresh, "refresh");
  if (!payload || (await tokens.isBlacklisted(payload.jti))) throw invalid;
  const rows = await query("SELECT is_active FROM auth_user WHERE id = ?", [payload.user_id]);
  if (!rows.length || !rows[0].is_active) throw invalid;

  res.json({ access: tokens.createAccess(payload.user_id), refresh: await tokens.createRefresh(payload.user_id) });
}));

// POST /api/auth/logout/
router.post("/logout/", authenticate, wrap(async (req, res) => {
  const refresh = body(req).refresh;
  if (!refresh) throw new ApiError(400, { detail: "Refresh token is required." });
  const payload = tokens.verify(refresh, "refresh");
  if (!payload || (await tokens.isBlacklisted(payload.jti))) {
    throw new ApiError(400, { detail: "Invalid or already-expired refresh token." });
  }
  await tokens.blacklist(refresh, payload);
  res.status(205).end();
}));

async function getSettings(userId) {
  let rows = await query("SELECT * FROM accounts_usersettings WHERE user_id = ?", [userId]);
  if (!rows.length) {
    const now = nowDb();
    await query(
      `INSERT IGNORE INTO accounts_usersettings
         (user_id, default_timezone, default_publish_time, notify_scheduled, notify_failed, notify_published, created_at, updated_at)
       VALUES (?, 'Asia/Kolkata', '09:00:00', 1, 1, 0, ?, ?)`,
      [userId, now, now]
    );
    rows = await query("SELECT * FROM accounts_usersettings WHERE user_id = ?", [userId]);
  }
  return rows[0];
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?$/;
const BOOL_TRUE = ["true", "True", "TRUE", "t", "T", "y", "Y", "yes", "Yes", "YES", "on", "On", "ON", "1", 1, true];
const BOOL_FALSE = ["false", "False", "FALSE", "f", "F", "n", "N", "no", "No", "NO", "off", "Off", "OFF", "0", 0, false];

// GET/PATCH /api/auth/me/
router.get("/me/", authenticate, wrap(async (req, res) => {
  res.json({ user: userOut(req.user), settings: settingsOut(await getSettings(req.user.id)) });
}));

router.patch("/me/", authenticate, wrap(async (req, res) => {
  const data = body(req);
  let user = req.user;

  // Validate settings first so a bad value leaves nothing half-applied.
  const errors = {};
  const updates = {};
  if ("default_timezone" in data) {
    const v = String(data.default_timezone ?? "");
    if (!v) errors.default_timezone = ["This field may not be blank."];
    else if (v.length > 64) errors.default_timezone = ["Ensure this field has no more than 64 characters."];
    else updates.default_timezone = v;
  }
  if ("default_publish_time" in data) {
    const m = TIME_RE.exec(String(data.default_publish_time ?? "").trim());
    if (m && +m[1] < 24 && +m[2] < 60 && +(m[3] || 0) < 60) {
      updates.default_publish_time = `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}`;
    } else {
      errors.default_publish_time = ["Time has wrong format. Use one of these formats instead: hh:mm[:ss[.uuuuuu]]."];
    }
  }
  for (const f of ["notify_scheduled", "notify_failed", "notify_published"]) {
    if (!(f in data)) continue;
    if (BOOL_TRUE.includes(data[f])) updates[f] = 1;
    else if (BOOL_FALSE.includes(data[f])) updates[f] = 0;
    else errors[f] = [`"${data[f]}" is not a valid boolean.`];
  }
  if (Object.keys(errors).length) throw new ApiError(400, errors);

  const userUpdates = {};
  if ("first_name" in data) userUpdates.first_name = data.first_name;
  if ("email" in data) userUpdates.email = data.email;
  if (Object.keys(userUpdates).length) {
    await query("UPDATE auth_user SET ? WHERE id = ?", [userUpdates, user.id]);
    user = { ...user, ...userUpdates };
  }

  await getSettings(user.id);
  if (Object.keys(updates).length) {
    await query("UPDATE accounts_usersettings SET ?, updated_at = ? WHERE user_id = ?", [updates, nowDb(), user.id]);
  }
  res.json({ user: userOut(user), settings: settingsOut(await getSettings(user.id)) });
}));

module.exports = router;
