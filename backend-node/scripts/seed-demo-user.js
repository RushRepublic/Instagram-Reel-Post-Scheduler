// Port of `manage.py seed_demo_user`: creates/updates the demo admin and resets its
// password. Run deliberately; override with SEED_EMAIL / SEED_PASSWORD (recommended in production).
const { query, pool } = require("../src/config/db");
const password = require("../src/lib/djangoPassword");
const { nowDb } = require("../src/lib/dates");

const EMAIL = process.env.SEED_EMAIL || "admin@rushrepublic.com";
const PASSWORD = process.env.SEED_PASSWORD || "admin123";

(async () => {
  const now = nowDb();
  const hash = password.make(PASSWORD);
  const existing = await query("SELECT id FROM auth_user WHERE username = ?", [EMAIL]);
  let id;
  if (existing.length) {
    id = existing[0].id;
    await query("UPDATE auth_user SET password=?, is_staff=1, is_superuser=1 WHERE id=?", [hash, id]);
  } else {
    const r = await query("INSERT INTO auth_user SET ?", [{
      username: EMAIL, email: EMAIL, first_name: "Admin", last_name: "", password: hash,
      is_staff: 1, is_superuser: 1, is_active: 1, date_joined: now,
    }]);
    id = r.insertId;
  }
  await query(
    `INSERT IGNORE INTO accounts_usersettings
       (user_id, default_timezone, default_publish_time, notify_scheduled, notify_failed, notify_published, created_at, updated_at)
     VALUES (?, 'Asia/Kolkata', '09:00:00', 1, 1, 0, ?, ?)`,
    [id, now, now]
  );
  console.log(`${existing.length ? "Updated" : "Created"} demo user: ${EMAIL}`);
})()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
