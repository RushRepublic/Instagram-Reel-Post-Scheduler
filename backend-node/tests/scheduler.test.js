// Duplicate-publish protection and due-job pickup. Needs the disposable DB
// (RUN_INTEGRATION=1 plus the same DB_* env as the server). Never uses real Meta calls:
// META_PUBLISHING_ENABLED must be False, so every publish attempt ends FAILED safely.
const test = require("node:test");
const assert = require("node:assert");

const enabled = process.env.RUN_INTEGRATION === "1";
test.after(async () => { if (enabled) await require("../src/config/db").pool.end(); });
const opts = { skip: enabled ? false : "set RUN_INTEGRATION=1 (needs a disposable DB)" };

test("only one of many concurrent workers claims a SCHEDULED row", opts, async () => {
  const { query, pool } = require("../src/config/db");
  const { claim } = require("../src/services/publisher");
  const { nowDb } = require("../src/lib/dates");
  const [{ id: userId }] = await query("SELECT id FROM auth_user LIMIT 1");
  const [{ id: accId }] = await query("SELECT id FROM instagram_accounts_instagramaccount LIMIT 1");
  const now = nowDb();
  const m = await query("INSERT INTO scheduler_mediafile SET ?", [{
    uploaded_by_id: userId, file: "content/x/none.png", kind: "IMAGE", original_filename: "none.png", size_bytes: 1, created_at: now,
  }]);
  const c = await query("INSERT INTO scheduler_scheduledcontent SET ?", [{
    user_id: userId, instagram_account_id: accId, content_type: "POST", caption: "", media_id: m.insertId,
    scheduled_at: now, timezone: "UTC", status: "SCHEDULED", celery_task_id: "", meta_container_id: "",
    instagram_media_id: "", instagram_permalink: "", failure_reason: "", created_at: now, updated_at: now,
  }]);
  const results = await Promise.all(Array.from({ length: 10 }, () => claim(c.insertId)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await query("SELECT status FROM scheduler_scheduledcontent WHERE id=?", [c.insertId]))[0].status, "PROCESSING");
});

test("runDueJobs picks up due rows only, and fails stuck PROCESSING rows", opts, async () => {
  const { query, pool } = require("../src/config/db");
  const { runDueJobs } = require("../src/jobs/runDueJobs");
  const { toDb, nowDb } = require("../src/lib/dates");
  const [{ id: userId }] = await query("SELECT id FROM auth_user LIMIT 1");
  const [{ id: accId }] = await query("SELECT id FROM instagram_accounts_instagramaccount LIMIT 1");
  const [{ id: mediaId }] = await query("SELECT id FROM scheduler_mediafile LIMIT 1");
  const now = nowDb();
  const mk = async (status, when, updated = now) =>
    (await query("INSERT INTO scheduler_scheduledcontent SET ?", [{
      user_id: userId, instagram_account_id: accId, content_type: "POST", caption: "", media_id: mediaId,
      scheduled_at: toDb(when), timezone: "UTC", status, celery_task_id: "", meta_container_id: "",
      instagram_media_id: "", instagram_permalink: "", failure_reason: "", created_at: now, updated_at: updated,
    }])).insertId;

  const due = await mk("SCHEDULED", new Date(Date.now() - 60000));
  const later = await mk("SCHEDULED", new Date(Date.now() + 3600000));
  const cancelled = await mk("CANCELLED", new Date(Date.now() - 60000));
  const stuck = await mk("PROCESSING", new Date(Date.now() - 7200000), toDb(new Date(Date.now() - 3600000)));

  await runDueJobs();
  const st = async (id) => (await query("SELECT status, failure_reason FROM scheduler_scheduledcontent WHERE id=?", [id]))[0];
  assert.equal((await st(due)).status, "FAILED"); // processed (publishing disabled -> safe failure)
  assert.match((await st(due)).failure_reason, /META_PUBLISHING_ENABLED is False/);
  assert.equal((await st(later)).status, "SCHEDULED"); // not due yet
  assert.equal((await st(cancelled)).status, "CANCELLED");
  assert.equal((await st(stuck)).status, "FAILED");
  assert.match((await st(stuck)).failure_reason, /interrupted/);
});
