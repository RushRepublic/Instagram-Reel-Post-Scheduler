// simplejwt-compatible tokens (HS256, claims token_type/exp/iat/jti/user_id) and
// the token_blacklist tables, so tokens issued by the Django backend stay valid.
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { query } = require("../config/db");
const { toDb } = require("./dates");

const newJti = () => crypto.randomUUID().replace(/-/g, "");

function sign(userId, type, lifetimeS, jti = newJti()) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = { token_type: type, exp: iat + lifetimeS, iat, jti, user_id: userId };
  return { token: jwt.sign(payload, env.secretKey, { algorithm: "HS256", noTimestamp: true }), payload };
}

async function createRefresh(userId) {
  const { token, payload } = sign(userId, "refresh", env.refreshLifetimeS);
  await query(
    "INSERT INTO token_blacklist_outstandingtoken (user_id, jti, token, created_at, expires_at) VALUES (?,?,?,?,?)",
    [userId, payload.jti, token, toDb(new Date(payload.iat * 1000)), toDb(new Date(payload.exp * 1000))]
  );
  return token;
}

const createAccess = (userId) => sign(userId, "access", env.accessLifetimeS).token;

/** Returns payload or null. Never throws. */
function verify(token, type) {
  try {
    const p = jwt.verify(token, env.secretKey, { algorithms: ["HS256"] });
    return p.token_type === type && p.user_id !== undefined ? p : null;
  } catch {
    return null;
  }
}

async function isBlacklisted(jti) {
  const rows = await query(
    `SELECT b.id FROM token_blacklist_blacklistedtoken b
       JOIN token_blacklist_outstandingtoken o ON o.id = b.token_id WHERE o.jti = ? LIMIT 1`,
    [jti]
  );
  return rows.length > 0;
}

async function blacklist(token, payload) {
  let rows = await query("SELECT id FROM token_blacklist_outstandingtoken WHERE jti = ?", [payload.jti]);
  if (!rows.length) {
    await query(
      "INSERT INTO token_blacklist_outstandingtoken (user_id, jti, token, created_at, expires_at) VALUES (?,?,?,?,?)",
      [payload.user_id, payload.jti, token, toDb(new Date(payload.iat * 1000)), toDb(new Date(payload.exp * 1000))]
    );
    rows = await query("SELECT id FROM token_blacklist_outstandingtoken WHERE jti = ?", [payload.jti]);
  }
  await query("INSERT IGNORE INTO token_blacklist_blacklistedtoken (token_id, blacklisted_at) VALUES (?,?)", [
    rows[0].id,
    toDb(new Date()),
  ]);
}

module.exports = { createRefresh, createAccess, verify, isBlacklisted, blacklist };
