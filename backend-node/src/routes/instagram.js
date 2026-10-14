const express = require("express");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { query } = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { wrap, ApiError, notFound } = require("../lib/errors");
const { accountOut } = require("../lib/serializers");
const { connectInstagramAccountsForUser, AccountConnectionError } = require("../services/accountService");

const router = express.Router();

const OAUTH_SCOPES = [
  "pages_show_list",
  "instagram_basic",
  "instagram_content_publish",
  "pages_read_engagement",
  "business_management",
];
const STATE_AUDIENCE = "instagram-oauth-state";
const enc = (obj) => new URLSearchParams(obj).toString();

router.get("/accounts/", authenticate, wrap(async (req, res) => {
  const rows = await query(
    "SELECT * FROM instagram_accounts_instagramaccount WHERE user_id = ? AND is_active = 1 ORDER BY connected_at DESC",
    [req.user.id]
  );
  res.json(rows.map(accountOut));
}));

router.get("/accounts/:pk(\\d+)/", authenticate, wrap(async (req, res) => {
  const rows = await query("SELECT * FROM instagram_accounts_instagramaccount WHERE id = ? AND user_id = ?", [
    req.params.pk,
    req.user.id,
  ]);
  if (!rows.length) throw notFound();
  res.json(accountOut(rows[0]));
}));

// Returns the Facebook OAuth dialog URL; `state` is a signed 10-minute token carrying the user id.
router.get("/oauth/start/", authenticate, wrap(async (req, res) => {
  if (!env.meta.appId) throw new ApiError(503, { detail: "META_APP_ID is not configured on the backend." });
  const state = jwt.sign({ user_id: req.user.id }, env.secretKey, { audience: STATE_AUDIENCE, expiresIn: 600 });
  const params = enc({
    client_id: env.meta.appId,
    redirect_uri: env.meta.redirectUri,
    state,
    scope: OAUTH_SCOPES.join(","),
    response_type: "code",
  });
  res.json({ auth_url: `https://www.facebook.com/${env.meta.apiVersion}/dialog/oauth?${params}` });
}));

// Browser redirect from Facebook — no JWT header; identity comes from the signed state.
router.get("/oauth/callback/", wrap(async (req, res) => {
  const accountsPage = `${env.frontendUrl}/app/accounts`;
  const { code, state } = req.query;
  if (!code || !state) return res.redirect(`${accountsPage}?connect_error=missing_code_or_state`);

  let userId;
  try {
    userId = jwt.verify(String(state), env.secretKey, { audience: STATE_AUDIENCE, algorithms: ["HS256"] }).user_id;
  } catch {
    return res.redirect(`${accountsPage}?connect_error=invalid_state`);
  }
  const users = await query("SELECT id FROM auth_user WHERE id = ?", [userId]);
  if (!users.length) return res.redirect(`${accountsPage}?connect_error=unknown_user`);

  let result;
  try {
    result = await connectInstagramAccountsForUser(userId, String(code), env.meta.redirectUri);
  } catch (err) {
    if (err instanceof AccountConnectionError) {
      return res.redirect(`${accountsPage}?connect_error=${enc({ msg: err.message })}`);
    }
    throw err;
  }
  const params = { connected_count: result.connected.length, skipped_count: result.skipped.length };
  if (result.skipped.length) params.skipped_names = result.skipped.map((s) => s.page_name).join(",");
  res.redirect(`${accountsPage}?${enc(params)}`);
}));

module.exports = router;
