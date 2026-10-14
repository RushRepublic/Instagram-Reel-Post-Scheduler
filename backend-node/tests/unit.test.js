const test = require("node:test");
const assert = require("node:assert");

process.env.FIELD_ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY || "ZmDfcTF7_60GrrY167zsiPd67pEvs0aGOv2oasOM1Pg=";
process.env.DJANGO_SECRET_KEY = process.env.DJANGO_SECRET_KEY || "unit-test-secret";

const dates = require("../src/lib/dates");
const fernet = require("../src/lib/fernet");
const pw = require("../src/lib/djangoPassword");
const { validName } = require("../src/lib/mediaStorage");

test("toIso mirrors DRF datetime output", () => {
  assert.equal(dates.toIso("2026-10-05 14:00:00.000000"), "2026-10-05T14:00:00Z");
  assert.equal(dates.toIso("2026-10-05 14:00:00"), "2026-10-05T14:00:00Z");
  assert.equal(dates.toIso("2026-10-05 14:00:00.123456"), "2026-10-05T14:00:00.123456Z");
  assert.equal(dates.toIso(null), null);
});

test("wall-clock scheduled_at is interpreted in the given IANA zone", () => {
  // 19:30 in Asia/Kolkata (UTC+5:30) == 14:00 UTC
  assert.equal(dates.parseWallClock("2026-10-05T19:30", "Asia/Kolkata").toISOString(), "2026-10-05T14:00:00.000Z");
  assert.equal(dates.parseWallClock("2026-10-05T19:30:00Z", "Asia/Kolkata").toISOString(), "2026-10-05T14:00:00.000Z");
  assert.equal(dates.parseWallClock("2026-10-05T19:30+00:00", "Asia/Kolkata").toISOString(), "2026-10-05T19:30:00.000Z");
  assert.equal(dates.parseWallClock("garbage", "UTC"), null);
  assert.ok(dates.isValidZone("America/New_York"));
  assert.ok(!dates.isValidZone("Mars/Base"));
});

test("PATCH datetime parsing treats naive values as UTC", () => {
  assert.equal(dates.parseInstant("2026-10-05T19:30:00").toISOString(), "2026-10-05T19:30:00.000Z");
  assert.equal(dates.parseInstant("2026-10-05T19:30:00+05:30").toISOString(), "2026-10-05T14:00:00.000Z");
});

test("fernet round-trips and rejects tampering", () => {
  const t = fernet.encrypt("EAAB-token");
  assert.notEqual(t, "EAAB-token");
  assert.equal(fernet.decrypt(t), "EAAB-token");
  assert.equal(fernet.decrypt(t.slice(0, -4) + "AAAA"), "");
  assert.equal(fernet.decrypt(""), "");
});

test("django pbkdf2 hash verify/make", () => {
  const h = pw.make("admin123", 1000);
  assert.ok(pw.verify("admin123", h));
  assert.ok(!pw.verify("wrong", h));
  assert.ok(!pw.verify("x", "bcrypt$nope"));
});

test("filename sanitising matches Django get_valid_name", () => {
  assert.equal(validName("my reel (final).mp4"), "my_reel_final.mp4");
  assert.equal(validName("../../etc/passwd.png"), "passwd.png");
});
