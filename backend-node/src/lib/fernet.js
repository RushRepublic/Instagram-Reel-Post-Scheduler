// Minimal Fernet (https://github.com/fernet/spec) — byte-compatible with
// Python's cryptography.fernet, which encrypted the existing access tokens.
const crypto = require("crypto");
const env = require("../config/env");

function keys() {
  if (!env.fieldEncryptionKey) throw new Error("FIELD_ENCRYPTION_KEY is not set.");
  const k = Buffer.from(env.fieldEncryptionKey.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (k.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be a 32-byte url-safe base64 Fernet key.");
  return { sign: k.subarray(0, 16), enc: k.subarray(16) };
}
const b64u = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === "") return plain;
  const { sign, enc } = keys();
  const iv = crypto.randomBytes(16);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const c = crypto.createCipheriv("aes-128-cbc", enc, iv);
  const ct = Buffer.concat([c.update(Buffer.from(plain, "utf8")), c.final()]);
  const body = Buffer.concat([Buffer.from([0x80]), ts, iv, ct]);
  const mac = crypto.createHmac("sha256", sign).update(body).digest();
  return b64u(Buffer.concat([body, mac]));
}

/** Returns "" on any failure (rotated key / pre-encryption value), like the Django field. */
function decrypt(token) {
  if (token === null || token === undefined || token === "") return token;
  try {
    const { sign, enc } = keys();
    const raw = Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (raw[0] !== 0x80 || raw.length < 57) return "";
    const body = raw.subarray(0, raw.length - 32);
    const mac = raw.subarray(raw.length - 32);
    const good = crypto.createHmac("sha256", sign).update(body).digest();
    if (!crypto.timingSafeEqual(mac, good)) return "";
    const d = crypto.createDecipheriv("aes-128-cbc", enc, body.subarray(9, 25));
    return Buffer.concat([d.update(body.subarray(25)), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

module.exports = { encrypt, decrypt };
