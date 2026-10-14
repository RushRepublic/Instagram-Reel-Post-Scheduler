// Upload validation (port of scheduler/validators.py): extension, declared
// MIME type, size, and a file-signature sniff (replaces python-magic).
const fs = require("fs");
const path = require("path");

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];
const VIDEO_EXTENSIONS = [".mp4", ".mov"];
const IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];
const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"];
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 250 * 1024 * 1024;

function sniffMimeType(filePath) {
  const fd = fs.openSync(filePath, "r");
  const h = Buffer.alloc(32);
  const n = fs.readSync(fd, h, 0, 32, 0);
  fs.closeSync(fd);
  if (n >= 3 && h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "image/jpeg";
  if (n >= 8 && h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (n >= 12 && h.subarray(4, 8).toString("latin1") === "ftyp") {
    return h.subarray(8, 12).toString("latin1") === "qt  " ? "video/quicktime" : "video/mp4";
  }
  if (n >= 8 && ["moov", "mdat", "wide", "free"].includes(h.subarray(4, 8).toString("latin1"))) return "video/quicktime";
  return "application/octet-stream";
}

/** file: { originalname, size, mimetype, path }. Returns an error message or null. */
function validateMediaFile(file, contentType) {
  const ext = path.extname(file.originalname).toLowerCase();
  let allowedExt, allowedMime, maxSize, label;
  if (contentType === "POST") [allowedExt, allowedMime, maxSize, label] = [IMAGE_EXTENSIONS, IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, "image"];
  else if (contentType === "REEL") [allowedExt, allowedMime, maxSize, label] = [VIDEO_EXTENSIONS, VIDEO_MIME_TYPES, MAX_VIDEO_SIZE_BYTES, "video"];
  else return `Unknown content_type '${contentType}'.`;

  if (!allowedExt.includes(ext)) {
    return `Unsupported file extension '${ext}' for a ${label}. Allowed: ${[...allowedExt].sort().join(", ")}.`;
  }
  if (file.size > maxSize) {
    return `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum for a ${label} is ${Math.round(maxSize / (1024 * 1024))} MB.`;
  }
  if (file.mimetype && !allowedMime.includes(file.mimetype)) {
    return `Unsupported content type '${file.mimetype}' for a ${label}.`;
  }
  const sniffed = sniffMimeType(file.path);
  if (!allowedMime.includes(sniffed)) {
    return `File contents do not match a ${label} (detected '${sniffed}'). The file may be corrupted or mislabeled.`;
  }
  return null;
}

module.exports = { validateMediaFile, sniffMimeType, MAX_VIDEO_SIZE_BYTES };
