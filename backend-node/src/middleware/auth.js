const { query } = require("../config/db");
const tokens = require("../lib/tokens");
const { ApiError } = require("../lib/errors");

/** DRF IsAuthenticated + simplejwt JWTAuthentication equivalent. */
async function authenticate(req, _res, next) {
  try {
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
