// End-to-end tests against a RUNNING server and a DISPOSABLE MySQL database
// (never point these at production data). Enable with:
//   RUN_INTEGRATION=1 BASE_URL=http://localhost:3500 DJANGO_ACCESS_TOKEN=... DJANGO_REFRESH_TOKEN=... npm test
// The database must have been created by Django's `migrate` and seeded with
// `seed_demo_user` plus one active InstagramAccount (see docs/MIGRATION.md).
const test = require("node:test");
const assert = require("node:assert");

const enabled = process.env.RUN_INTEGRATION === "1";
const BASE = (process.env.BASE_URL || "http://localhost:3500") + "/api";
const opts = { skip: enabled ? false : "set RUN_INTEGRATION=1 (needs a disposable DB + running server)" };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

let access, refresh, accountId;
const call = async (method, path, { body, form, token = access } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
};
const future = (mins) => new Date(Date.now() + mins * 60000).toISOString().slice(0, 16);
const pngForm = (extra = {}, name = "pic.png", buf = PNG, type = "image/png") => {
  const f = new FormData();
  f.append("instagram_account", String(accountId));
  f.append("content_type", "POST");
  f.append("caption", "hello");
  f.append("scheduled_at", future(60));
  f.append("timezone", "UTC");
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  f.append("media", new Blob([buf], { type }), name);
  return f;
};

test("login with a Django-hashed password", opts, async () => {
  const bad = await call("POST", "/auth/login/", { body: { email: "admin@rushrepublic.com", password: "nope" }, token: null });
  assert.equal(bad.status, 401);
  assert.deepEqual(bad.json, { detail: "Invalid email or password." });
  const empty = await call("POST", "/auth/login/", { body: {}, token: null });
  assert.equal(empty.status, 400);
  const ok = await call("POST", "/auth/login/", { body: { email: "admin@rushrepublic.com", password: "admin123" }, token: null });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.access && ok.json.refresh);
  assert.equal(ok.json.user.email, "admin@rushrepublic.com");
  ({ access, refresh } = ok.json);
});

test("protected routes reject anonymous requests (401, DRF body)", opts, async () => {
  const r = await call("GET", "/dashboard/", { token: null });
  assert.equal(r.status, 401);
  assert.equal(r.json.detail, "Authentication credentials were not provided.");
  assert.equal((await call("GET", "/dashboard/", { token: "garbage" })).status, 401);
});

test("access token issued by DJANGO is accepted by Node", opts, async (t) => {
  if (!process.env.DJANGO_ACCESS_TOKEN) return t.skip("DJANGO_ACCESS_TOKEN not provided");
  const r = await call("GET", "/auth/me/", { token: process.env.DJANGO_ACCESS_TOKEN });
  assert.equal(r.status, 200);
});

test("refresh token issued by DJANGO can be refreshed by Node", opts, async (t) => {
  if (!process.env.DJANGO_REFRESH_TOKEN) return t.skip("DJANGO_REFRESH_TOKEN not provided");
  const r = await call("POST", "/auth/refresh/", { body: { refresh: process.env.DJANGO_REFRESH_TOKEN }, token: null });
  assert.equal(r.status, 200);
  assert.ok(r.json.access);
});

test("me GET/PATCH + validation", opts, async () => {
  const g = await call("GET", "/auth/me/");
  assert.equal(g.status, 200);
  assert.equal(g.json.settings.default_timezone, "Asia/Kolkata");
  assert.equal(g.json.settings.default_publish_time, "09:00:00");
  const p = await call("PATCH", "/auth/me/", { body: { first_name: "Boss", default_timezone: "UTC", notify_published: true, default_publish_time: "10:15" } });
  assert.equal(p.status, 200);
  assert.equal(p.json.user.first_name, "Boss");
  assert.deepEqual([p.json.settings.default_timezone, p.json.settings.notify_published, p.json.settings.default_publish_time], ["UTC", true, "10:15:00"]);
  const bad = await call("PATCH", "/auth/me/", { body: { default_publish_time: "xx" } });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.default_publish_time);
});

test("accounts: list never exposes tokens; detail 404s", opts, async () => {
  const l = await call("GET", "/instagram/accounts/");
  assert.equal(l.status, 200);
  assert.ok(l.json.length >= 1);
  accountId = l.json[0].id;
  assert.ok(!("access_token" in l.json[0]) && !("token_expires_at" in l.json[0]));
  assert.equal((await call("GET", `/instagram/accounts/${accountId}/`)).status, 200);
  const nf = await call("GET", "/instagram/accounts/99999/");
  assert.equal(nf.status, 404);
  assert.deepEqual(nf.json, { detail: "Not found." });
});

test("oauth start returns a signed Facebook dialog URL", opts, async () => {
  const r = await call("GET", "/instagram/oauth/start/");
  assert.equal(r.status, 200);
  assert.match(r.json.auth_url, /^https:\/\/www\.facebook\.com\/v[\d.]+\/dialog\/oauth\?/);
  assert.match(r.json.auth_url, /state=/);
  const cb = await fetch(BASE + "/instagram/oauth/callback/?code=x&state=bad", { redirect: "manual" });
  assert.equal(cb.status, 302);
  assert.match(cb.headers.get("location"), /connect_error=invalid_state$/);
});

let scheduledId;
test("create scheduled POST, then list/detail/patch/dashboard/calendar", opts, async () => {
  const c = await call("POST", "/content/", { form: pngForm() });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  assert.equal(c.json.status, "SCHEDULED");
  assert.equal(c.json.instagram_account.id, accountId);
  assert.match(c.json.media.url, /^http:\/\/.+\/media\/content\/\d+\/pic.*\.png$/);
  assert.equal(c.json.media.kind, "IMAGE");
  scheduledId = c.json.id;

  const media = await fetch(c.json.media.url);
  assert.equal(media.status, 200);
  assert.equal(Buffer.from(await media.arrayBuffer()).length, PNG.length);

  const list = await call("GET", "/content/?status=SCHEDULED&search=hel");
  assert.ok(list.json.some((x) => x.id === scheduledId));
  assert.equal((await call("GET", "/content/?search=zzzznomatch")).json.length, 0);
  assert.equal((await call("GET", `/content/${scheduledId}/`)).json.id, scheduledId);

  const newTime = new Date(Date.now() + 2 * 3600000).toISOString();
  const p = await call("PATCH", `/content/${scheduledId}/`, { body: { caption: "edited", scheduled_at: newTime } });
  assert.equal(p.status, 200);
  assert.equal(p.json.caption, "edited");
  assert.equal(new Date(p.json.scheduled_at).getTime(), new Date(newTime).getTime());
  const past = await call("PATCH", `/content/${scheduledId}/`, { body: { scheduled_at: "2020-01-01T00:00:00Z" } });
  assert.equal(past.status, 400);

  const d = await call("GET", "/dashboard/");
  assert.ok(d.json.scheduled_count >= 1);
  assert.equal(typeof d.json.connected_accounts_count, "number");
  assert.ok(Array.isArray(d.json.upcoming_content));

  const day = newTime.slice(0, 10);
  const cal = await call("GET", `/calendar/?start_date=${day}&end_date=${day}`);
  assert.ok(cal.json.some((x) => x.id === scheduledId));
});

test("create validation errors use DRF shapes", opts, async () => {
  const noFile = new FormData();
  noFile.append("content_type", "REEL");
  const a = await call("POST", "/content/", { form: noFile });
  assert.equal(a.status, 400);
  assert.deepEqual(a.json.instagram_account, ["This field is required."]);
  assert.deepEqual(a.json.media, ["No file was submitted."]);
  assert.deepEqual(a.json.scheduled_at, ["This field is required."]);

  const past = await call("POST", "/content/", { form: pngForm({ scheduled_at: "2020-01-01T10:00" }) });
  assert.deepEqual(past.json, { scheduled_at: ["Scheduled time must be in the future."] });

  const badTz = await call("POST", "/content/", { form: pngForm({ timezone: "Mars/Base" }) });
  assert.deepEqual(badTz.json.timezone, ["Unknown timezone 'Mars/Base'."]);

  const ext = await call("POST", "/content/", { form: pngForm({}, "x.gif") });
  assert.match(ext.json.media[0], /^Unsupported file extension '\.gif' for a image/);

  const fake = await call("POST", "/content/", { form: pngForm({}, "fake.png", Buffer.from("MZ not an image at all")) });
  assert.match(fake.json.media[0], /^File contents do not match a image/);

  const reelWithPng = await call("POST", "/content/", { form: pngForm({ content_type: "REEL" }, "a.mp4", PNG, "video/mp4") });
  assert.match(reelWithPng.json.media[0], /^File contents do not match a video/);
});

test("cancel, then cancel/edit/retry state guards (409)", opts, async () => {
  const c = await call("POST", `/content/${scheduledId}/cancel/`);
  assert.equal(c.status, 200);
  assert.equal(c.json.status, "CANCELLED");
  assert.equal((await call("POST", `/content/${scheduledId}/cancel/`)).status, 409);
  assert.equal((await call("PATCH", `/content/${scheduledId}/`, { body: { caption: "x" } })).status, 409);
  const r = await call("POST", `/content/${scheduledId}/retry/`);
  assert.equal(r.status, 409);
  assert.equal(r.json.detail, "Can only retry FAILED content (current status: CANCELLED).");
});

test("publish-now with META_PUBLISHING_ENABLED=False ends FAILED with the safety message; retry re-runs", opts, async () => {
  const c = await call("POST", "/content/", { form: pngForm({ publish_now: "true" }) });
  assert.equal(c.status, 201);
  let cur;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    cur = (await call("GET", `/content/${c.json.id}/`)).json;
    if (cur.status === "FAILED") break;
  }
  assert.equal(cur.status, "FAILED");
  assert.match(cur.failure_reason, /META_PUBLISHING_ENABLED is False/);
  assert.ok(cur.failed_at);
  const retry = await call("POST", `/content/${c.json.id}/retry/`);
  assert.equal(retry.status, 200);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    cur = (await call("GET", `/content/${c.json.id}/`)).json;
    if (cur.status === "FAILED") break;
  }
  assert.equal(cur.status, "FAILED");
  assert.equal((await call("GET", "/content/?status=FAILED")).json.some((x) => x.id === c.json.id), true);
});

test("analytics: unpublished account yields empty, never fabricated, results", opts, async () => {
  const r = await call("GET", "/analytics/?account=@testhandle");
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.results, []);
});

test("refresh rotates; logout blacklists the refresh token", opts, async () => {
  const rf = await call("POST", "/auth/refresh/", { body: { refresh }, token: null });
  assert.equal(rf.status, 200);
  assert.ok(rf.json.access && rf.json.refresh);
  assert.equal((await call("POST", "/auth/refresh/", { body: {}, token: null })).status, 400);

  const lo = await call("POST", "/auth/logout/", { body: { refresh: rf.json.refresh } });
  assert.equal(lo.status, 205);
  const again = await call("POST", "/auth/refresh/", { body: { refresh: rf.json.refresh }, token: null });
  assert.equal(again.status, 401);
  const twice = await call("POST", "/auth/logout/", { body: { refresh: rf.json.refresh } });
  assert.equal(twice.status, 400);
  assert.equal((await call("POST", "/auth/logout/", { body: {} })).status, 400);
});
