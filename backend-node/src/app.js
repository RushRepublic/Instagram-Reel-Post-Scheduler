const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const env = require("./config/env");
const { ApiError } = require("./lib/errors");

const app = express();
app.set("trust proxy", 1); // behind Hostinger's proxy: correct https:// in absolute media URLs
app.disable("x-powered-by");

// Media must be fetchable cross-origin by the React app and by Meta's servers.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(env.mediaUrl.replace(/\/$/, ""), express.static(env.mediaRoot, { dotfiles: "ignore", index: false }));

app.get("/api/health/", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/instagram", require("./routes/instagram"));
app.use("/api/analytics", require("./routes/analytics"));
app.use("/api", require("./routes/content")); // content/, dashboard/, calendar/

app.use((_req, res) => res.status(404).json({ detail: "Not found." }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ApiError) return res.status(err.status).json(err.body);
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "File is too large." : err.message;
    return res.status(400).json({ media: [msg] });
  }
  if (err.type === "entity.parse.failed") return res.status(400).json({ detail: "JSON parse error - malformed request body." });
  if (err.type === "entity.too.large") return res.status(413).json({ detail: "Request body too large." });
  console.error("Unhandled error:", err);
  res.status(500).json({ detail: "Internal server error." });
});

module.exports = app;
