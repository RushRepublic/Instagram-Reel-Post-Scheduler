const { query } = require("../config/db");
const tokens = require("../lib/tokens");
const { ApiError } = require("../lib/errors");
const env = require("../config/env");

const USER_COLS = "id, username, email, first_name, last_name, is_active";

/** AUTH_REQUIRED=false: act as the default workspace user, no token needed. */
async function defaultUser() {
  let rows = await query(`SELECT ${USER_COLS} FROM auth_user WHERE username = ? AND is_active = 1`, [env.defaultUserEmail]);
  if (!rows.length) rows = await query(`SELECT ${USER_COLS} FROM auth_user WHERE is_active = 1 ORDER BY id LIMIT 1`);
  if (!rows.length) throw new ApiError(503, { detail: "No user exists in the database. Run: npm run seed-demo-user" });
  return rows[0];
}

/** DRF IsAuthenticated + simplejwt JWTAuthentication equivalent. */
async function authenticate(req, _res, next) {
  try {
    if (!env.authRequired) {
      req.user = await defaultUser();
      return next();
    }
    const header = req.get("Authorization") || "";
    const [scheme, raw] = header.split(" ");
    if (!raw || scheme.toLowerCase() !== "bearer") {
      throw new ApiError(401, { detail: "Authentication credentials were not provided." });
    }
    const payload = tokens.verify(raw, "access");
    if (!payload) {
      throw new ApiError(401, {
        detail: "Given token not valid for any token type",
        code: "token_not_valid",
        messages: [{ token_class: "AccessToken", token_type: "access", message: "Token is invalid or expired" }],
      });
    }
    const rows = await query(
      "SELECT id, username, email, first_name, last_name, is_active FROM auth_user WHERE id = ?",
      [payload.user_id]
    );
    if (!rows.length) throw new ApiError(401, { detail: "User not found", code: "user_not_found" });
    if (!rows[0].is_active) throw new ApiError(401, { detail: "User is inactive", code: "user_inactive" });
    req.user = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate };
