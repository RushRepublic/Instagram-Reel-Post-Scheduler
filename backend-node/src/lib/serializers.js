const env = require("../config/env");
const { toIso } = require("./dates");

const userOut = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  first_name: u.first_name,
  last_name: u.last_name,
});

const settingsOut = (s) => ({
  default_timezone: s.default_timezone,
  default_publish_time: String(s.default_publish_time).replace(/\.0+$/, ""),
  notify_scheduled: !!s.notify_scheduled,
  notify_failed: !!s.notify_failed,
  notify_published: !!s.notify_published,
});

const accountOut = (a) => ({
  id: a.id,
  username: a.username,
  display_name: a.display_name,
  instagram_user_id: a.instagram_user_id,
  facebook_page_id: a.facebook_page_id,
  profile_picture_url: a.profile_picture_url,
  account_type: a.account_type,
  is_active: !!a.is_active,
  connected_at: toIso(a.connected_at),
});

/** Django FileField.url: MEDIA_URL + percent-encoded storage name. */
const mediaRelUrl = (file) =>
  env.mediaUrl + file.split("/").map((p) => encodeURIComponent(p).replace(/%7E/g, "~")).join("/");

/** SELECT list that flattens content + account + media into one row (see contentRows). */
const CONTENT_SELECT = `
  c.id, c.content_type, c.caption, c.scheduled_at, c.timezone, c.status, c.instagram_media_id,
  c.instagram_permalink, c.meta_container_id, c.published_at, c.failed_at, c.failure_reason,
  c.created_at, c.updated_at, c.user_id, c.instagram_account_id, c.media_id,
  a.id AS a_id, a.username AS a_username, a.display_name AS a_display_name,
  a.instagram_user_id AS a_instagram_user_id, a.facebook_page_id AS a_facebook_page_id,
  a.profile_picture_url AS a_profile_picture_url, a.account_type AS a_account_type,
  a.is_active AS a_is_active, a.connected_at AS a_connected_at,
  m.id AS m_id, m.file AS m_file, m.kind AS m_kind, m.original_filename AS m_original_filename,
  m.size_bytes AS m_size_bytes, m.duration_seconds AS m_duration_seconds`;
const CONTENT_FROM = `
  FROM scheduler_scheduledcontent c
  JOIN instagram_accounts_instagramaccount a ON a.id = c.instagram_account_id
  JOIN scheduler_mediafile m ON m.id = c.media_id`;

function contentOut(r, req) {
  const rel = r.m_file ? mediaRelUrl(r.m_file) : null;
  return {
    id: r.id,
    content_type: r.content_type,
    instagram_account: accountOut({
      id: r.a_id, username: r.a_username, display_name: r.a_display_name,
      instagram_user_id: r.a_instagram_user_id, facebook_page_id: r.a_facebook_page_id,
      profile_picture_url: r.a_profile_picture_url, account_type: r.a_account_type,
      is_active: r.a_is_active, connected_at: r.a_connected_at,
    }),
    caption: r.caption,
    media: {
      id: r.m_id,
      url: rel && req ? `${req.protocol}://${req.get("host")}${rel}` : rel,
      kind: r.m_kind,
      original_filename: r.m_original_filename,
      size_bytes: Number(r.m_size_bytes),
      duration_seconds: r.m_duration_seconds,
    },
    scheduled_at: toIso(r.scheduled_at),
    timezone: r.timezone,
    status: r.status,
    instagram_media_id: r.instagram_media_id,
    instagram_permalink: r.instagram_permalink,
    meta_container_id: r.meta_container_id,
    published_at: toIso(r.published_at),
    failed_at: toIso(r.failed_at),
    failure_reason: r.failure_reason,
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  };
}

module.exports = { userOut, settingsOut, accountOut, contentOut, mediaRelUrl, CONTENT_SELECT, CONTENT_FROM };
