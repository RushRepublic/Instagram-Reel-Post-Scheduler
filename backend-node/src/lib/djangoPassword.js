// Verifies/creates Django's default pbkdf2_sha256 password hashes so existing
// auth_user rows keep working unchanged.
const crypto = require("crypto");

function verify(password, encoded) {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = parseInt(parts[1], 10);
  const expected = Buffer.from(parts[3], "base64");
  const actual = crypto.pbkdf2Sync(password, parts[2], iterations, expected.length, "sha256");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function make(password, iterations = 720000) {
  const salt = crypto.randomBytes(12).toString("base64").replace(/[^A-Za-z0-9]/g, "x");
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

module.exports = { verify, make };
