const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const e = process.env;
const bool = (v, d) => (v === undefined || v === "" ? d : ["true", "1", "yes", "on"].includes(String(v).toLowerCase()));
const list = (v, d) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : d);

const isProd = e.NODE_ENV === "production";
const secret = e.JWT_SECRET || e.DJANGO_SECRET_KEY || (isProd ? "" : "insecure-dev-key-change-me");
if (!secret) throw new Error("JWT_SECRET (or DJANGO_SECRET_KEY) must be set in production.");

module.exports = {
  isProd,
  port: parseInt(e.PORT || "3000", 10),
  secretKey: secret,
  fieldEncryptionKey: e.FIELD_ENCRYPTION_KEY || "",
  db: {
    host: e.DB_HOST || "127.0.0.1",
    port: parseInt(e.DB_PORT || "3306", 10),
    user: e.DB_USER || "rush_user",
    password: e.DB_PASSWORD || "changeme",
    database: e.DB_NAME || "rush_scheduler",
  },
  corsOrigins: list(e.CORS_ALLOWED_ORIGINS, ["http://localhost:5173", "http://127.0.0.1:5173"]),
  frontendUrl: e.FRONTEND_URL || "http://localhost:5173",
  meta: {
    appId: e.META_APP_ID || "",
    appSecret: e.META_APP_SECRET || "",
    apiVersion: e.META_API_VERSION || "v20.0",
    redirectUri: e.META_REDIRECT_URI || "http://localhost:8000/api/instagram/oauth/callback/",
    publishingEnabled: bool(e.META_PUBLISHING_ENABLED, false),
  },
  publicMediaBaseUrl: e.PUBLIC_MEDIA_BASE_URL || "",
  mediaUrl: "/media/",
  mediaRoot: path.resolve(e.MEDIA_ROOT || path.join(__dirname, "..", "..", "media")),
  scheduler: {
    inProcess: bool(e.ENABLE_INPROCESS_SCHEDULER, true),
    pollSeconds: parseInt(e.SCHEDULER_POLL_SECONDS || "30", 10),
    stuckMinutes: parseInt(e.STUCK_PROCESSING_MINUTES || "30", 10),
  },
  accessLifetimeS: 60 * 60,
  refreshLifetimeS: 7 * 24 * 60 * 60,
};
