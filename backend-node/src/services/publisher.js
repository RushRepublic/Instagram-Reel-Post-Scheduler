// Port of scheduler/tasks.py (Celery task) as a plain async function, with an
// atomic claim so the same row can never be published twice, no matter how
// many processes (web app poller, hPanel cron, publish-now) race for it.
const env = require("../config/env");
const { query } = require("../config/db");
const fernet = require("../lib/fernet");
const { nowDb } = require("../lib/dates");
const { mediaRelUrl } = require("../lib/serializers");
const publishing = require("./publishingService");

function buildPublicMediaUrl(file) {
  const rel = mediaRelUrl(file);
  if (!env.publicMediaBaseUrl) return rel; // relative — fails requirePublicUrl, by design
  return `${env.publicMediaBaseUrl.replace(/\/+$/, "")}${rel}`;
}

async function markFailed(id, reason) {
  const now = nowDb();
  await query(
    "UPDATE scheduler_scheduledcontent SET status='FAILED', failure_reason=?, failed_at=?, updated_at=? WHERE id=?",
    [reason, now, now, id]
  );
  console.error(`content_id=${id} FAILED: ${reason}`);
}

/**
 * SCHEDULED -> PROCESSING in one UPDATE. Returns true only for the single
 * caller whose UPDATE changed the row.
 */
async function claim(id) {
  const r = await query(
    "UPDATE scheduler_scheduledcontent SET status='PROCESSING', updated_at=? WHERE id=? AND status='SCHEDULED'",
    [nowDb(), id]
  );
  return r.affectedRows === 1;
}

async function publishScheduledContent(id) {
  if (!(await claim(id))) {
    console.log(`content_id=${id} not in SCHEDULED state (cancelled/published/claimed elsewhere) — skipping.`);
    return false;
  }

  const rows = await query(
    `SELECT c.id, c.content_type, c.caption, m.file AS media_file,
            a.is_active AS acc_active, a.access_token, a.instagram_user_id
       FROM scheduler_scheduledcontent c
       JOIN instagram_accounts_instagramaccount a ON a.id = c.instagram_account_id
       JOIN scheduler_mediafile m ON m.id = c.media_id
      WHERE c.id = ?`,
    [id]
  );
  const c = rows[0];
  if (!c) return false;

  if (!c.acc_active) return void (await markFailed(id, "Instagram account is not connected or was deactivated."));
  const accessToken = fernet.decrypt(c.access_token);
  if (!accessToken) return void (await markFailed(id, "Instagram account has no stored access token."));

  const mediaUrl = buildPublicMediaUrl(c.media_file);
  let result;
  try {
    result =
      c.content_type === "POST"
        ? await publishing.publishPost({ igUserId: c.instagram_user_id, accessToken, imageUrl: mediaUrl, caption: c.caption })
        : await publishing.publishReel({ igUserId: c.instagram_user_id, accessToken, videoUrl: mediaUrl, caption: c.caption });
  } catch (err) {
    if (err instanceof publishing.PublishingError) await markFailed(id, err.message);
    else {
      console.error(`Unexpected error publishing content_id=${id}`, err);
      await markFailed(id, `Unexpected error: ${err.message}`);
    }
    return false;
  }

  let permalink = "";
  try {
    permalink = (await publishing.getMediaPermalink(result.instagram_media_id, accessToken)) || "";
  } catch (err) {
    // Publish itself succeeded; a failed permalink lookup must not flip it back to FAILED.
    console.warn(`Published content_id=${id} but could not fetch permalink.`);
  }

  const now = nowDb();
  await query(
    `UPDATE scheduler_scheduledcontent
        SET instagram_media_id=?, meta_container_id=?, instagram_permalink=?, status='PUBLISHED',
            published_at=?, updated_at=? WHERE id=?`,
    [result.instagram_media_id, result.meta_container_id || "", permalink, now, now, id]
  );
  console.log(`content_id=${id} published successfully -> media_id=${result.instagram_media_id}`);
  return true;
}

module.exports = { publishScheduledContent, claim };
