const { DateTime } = require("luxon");

/** MySQL "YYYY-MM-DD HH:MM:SS[.ffffff]" (UTC) -> DRF-style ISO string ("...Z"). */
function toIso(v) {
  if (v === null || v === undefined || v === "") return null;
  const [d, t = "00:00:00"] = String(v).split(" ");
  const [hms, frac = ""] = t.split(".");
  const hasFrac = /[1-9]/.test(frac);
  return `${d}T${hms}${hasFrac ? "." + frac.padEnd(6, "0") : ""}Z`;
}

/** JS Date -> MySQL DATETIME(6) string in UTC. */
function toDb(date) {
  return date.toISOString().replace("T", " ").replace("Z", "") + "000";
}

const nowDb = () => toDb(new Date());

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/i;

/** Valid IANA zone? */
function isValidZone(name) {
  return DateTime.local().setZone(name).isValid;
}

/**
 * Wall-clock string interpreted in `zone` (ZoneInfo semantics of the Django
 * code). A trailing "Z" is stripped (as the original did); an explicit offset
 * is honoured. Returns a JS Date or null.
 */
function parseWallClock(str, zone) {
  const s = String(str).trim().replace(/Z$/i, "").replace(" ", "T");
  const dt = HAS_OFFSET.test(s) ? DateTime.fromISO(s, { setZone: true }) : DateTime.fromISO(s, { zone });
  return dt.isValid ? dt.toJSDate() : null;
}

/** Django parse_datetime + make_aware(UTC) semantics. Returns Date | null. */
function parseInstant(str) {
  const s = String(str).trim().replace(" ", "T");
  const dt = DateTime.fromISO(s, { setZone: true, zone: "utc" });
  return dt.isValid ? dt.toJSDate() : null;
}

module.exports = { toIso, toDb, nowDb, isValidZone, parseWallClock, parseInstant };
