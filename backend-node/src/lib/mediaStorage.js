// Mirrors Django's FileSystemStorage naming so existing `file` column values
// ("content/<user_id>/<name>") and on-disk paths stay valid.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const env = require("../config/env");

const ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** django.utils.text.get_valid_name */
function validName(name) {
  return path.basename(name.replace(/\\/g, "/")).trim().replace(/ /g, "_").replace(/[^-\p{L}\p{N}_.]/gu, "");
}

function randomSuffix() {
  let s = "";
  for (const b of crypto.randomBytes(7)) s += ALNUM[b % ALNUM.length];
  return s;
}

/** Moves an uploaded temp file into MEDIA_ROOT/content/<userId>/ and returns the storage name. */
async function saveUpload(tmpPath, originalName, userId) {
  const dir = `content/${userId}`; // always "/" — this string is stored in the DB and must match Django's
  await fs.promises.mkdir(path.join(env.mediaRoot, dir), { recursive: true });

  let filename = validName(originalName) || "upload";
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  // `file` column is VARCHAR(100): keep the full storage name within it.
  const maxStem = Math.max(1, 100 - dir.length - 1 - ext.length - 8);
  let rel = `${dir}/${filename}`;
  if (rel.length > 100) rel = `${dir}/${stem.slice(0, maxStem)}${ext}`;
  while (fs.existsSync(path.join(env.mediaRoot, rel))) {
    rel = `${dir}/${stem.slice(0, maxStem)}_${randomSuffix()}${ext}`;
  }
  const dest = path.join(env.mediaRoot, rel);
  try {
    await fs.promises.rename(tmpPath, dest);
  } catch {
    await fs.promises.copyFile(tmpPath, dest);
    await fs.promises.unlink(tmpPath);
  }
  return rel;
}

module.exports = { saveUpload, validName };
