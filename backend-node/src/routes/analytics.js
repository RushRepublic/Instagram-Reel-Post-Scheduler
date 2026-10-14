const express = require("express");
const { query } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { wrap } = require("../lib/errors");
const fernet = require("../lib/fernet");
const { toIso, nowDb } = require("../lib/dates");
const { getMediaInsights, InsightsError } = require("../services/insightsService");

const router = express.Router();

const metrics = (i) => ({
  reach: i.reach, impressions: i.impressions, likes: i.likes, comments: i.comments,
  shares: i.shares, saves: i.saves, plays: i.plays, recorded_at: toIso(i.recorded_at),
});

async function insightEntry(c) {
  const base = {
    content_id: c.id,
    content_type: c.content_type,
    instagram_media_id: c.instagram_media_id,
    published_at: toIso(c.published_at),
  };
  if (!c.instagram_media_id) return { ...base, source: "UNAVAILABLE", reason: "Not published yet.", metrics: null };

  let live;
  try {
    live = await getMediaInsights(c.instagram_media_id, fernet.decrypt(c.access_token), c.content_type === "REEL");
  } catch (err) {
    if (!(err instanceof InsightsError)) throw err;
    const cached = await query(
      "SELECT * FROM analytics_app_instagraminsight WHERE content_id = ? ORDER BY recorded_at DESC LIMIT 1",
      [c.id]
    );
    if (cached.length) return { ...base, source: "CACHED", reason: err.message, metrics: metrics(cached[0]) };
    return { ...base, source: "UNAVAILABLE", reason: err.message, metrics: null };
  }

  const recordedAt = nowDb();
  const row = {
    content_id: c.id,
    reach: live.reach ?? null, impressions: live.impressions ?? null, likes: live.likes ?? null,
    comments: live.comments ?? null, shares: live.shares ?? null, saves: live.saved ?? null,
    plays: live.plays ?? null, recorded_at: recordedAt,
  };
  await query("INSERT INTO analytics_app_instagraminsight SET ?", [row]);
  return { ...base, source: "META_API", reason: null, metrics: metrics(row) };
}

// GET /api/analytics/?account=@handle — real Graph API data only, never fabricated.
router.get("/", authenticate, wrap(async (req, res) => {
  const account = req.query.account;
  const params = [req.user.id];
  let sql = `SELECT c.id, c.content_type, c.instagram_media_id, c.published_at, a.access_token
               FROM scheduler_scheduledcontent c
               JOIN instagram_accounts_instagramaccount a ON a.id = c.instagram_account_id
              WHERE c.user_id = ? AND c.status = 'PUBLISHED'`;
  if (account) {
    sql += " AND a.username = ?";
    params.push(String(account).replace(/^@+/, ""));
  }
  sql += " ORDER BY c.scheduled_at DESC";
  const rows = await query(sql, params);

  const results = [];
  for (const c of rows) results.push(await insightEntry(c));
  res.json({ account: account ?? null, results });
}));

module.exports = router;
