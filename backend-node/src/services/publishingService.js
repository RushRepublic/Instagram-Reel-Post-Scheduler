// Instagram Content Publishing flow (port of publishing_service.py).
const env = require("../config/env");
const { MetaClient, MetaAPIError } = require("./metaClient");

class PublishingError extends Error {}
class PublishingDisabledError extends PublishingError {}

const CONTAINER_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_MAX_ATTEMPTS = 60; // ~5 minutes of polling at 5s

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requirePublishingEnabled() {
  if (!env.meta.publishingEnabled) {
    throw new PublishingDisabledError(
      "META_PUBLISHING_ENABLED is False. Set it to True in .env only after " +
        "you have explicitly reviewed and authorized a live publish test."
    );
  }
}

function requirePublicUrl(mediaUrl) {
  if (!mediaUrl.startsWith("http://") && !mediaUrl.startsWith("https://")) {
    throw new PublishingError(
      "Media URL is not publicly accessible. Set PUBLIC_MEDIA_BASE_URL " +
        "(e.g. an ngrok tunnel in dev) so Meta's servers can fetch the file."
    );
  }
  if (mediaUrl.includes("localhost") || mediaUrl.includes("127.0.0.1")) {
    throw new PublishingError(
      "Media URL points at localhost — Meta's servers cannot reach it. " +
        "Set PUBLIC_MEDIA_BASE_URL to a publicly reachable tunnel/host."
    );
  }
}

async function pollContainerStatus(client, containerId, maxAttempts, intervalMs = CONTAINER_POLL_INTERVAL_MS) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await client.get(containerId, { fields: "status_code" });
    const code = result.status_code;
    if (code === "FINISHED" || code === "ERROR") return code;
    await sleep(intervalMs);
  }
  throw new PublishingError("Timed out waiting for media container to finish processing.");
}

async function publishPost({ igUserId, accessToken, imageUrl, caption }) {
  requirePublishingEnabled();
  requirePublicUrl(imageUrl);
  const client = new MetaClient(accessToken);
  try {
    const container = await client.post(`${igUserId}/media`, { data: { image_url: imageUrl, caption } });
    const creationId = container.id;
    const published = await client.post(`${igUserId}/media_publish`, { data: { creation_id: creationId } });
    return { instagram_media_id: published.id, meta_container_id: creationId };
  } catch (err) {
    if (err instanceof MetaAPIError) throw new PublishingError(err.message);
    throw err;
  }
}

async function publishReel({ igUserId, accessToken, videoUrl, caption }) {
  requirePublishingEnabled();
  requirePublicUrl(videoUrl);
  const client = new MetaClient(accessToken);
  try {
    const container = await client.post(`${igUserId}/media`, {
      data: { media_type: "REELS", video_url: videoUrl, caption },
    });
    const creationId = container.id;
    const status = await pollContainerStatus(client, creationId, VIDEO_POLL_MAX_ATTEMPTS);
    if (status !== "FINISHED") throw new PublishingError(`Reel container did not finish processing (status=${status}).`);
    const published = await client.post(`${igUserId}/media_publish`, { data: { creation_id: creationId } });
    return { instagram_media_id: published.id, meta_container_id: creationId };
  } catch (err) {
    if (err instanceof MetaAPIError) throw new PublishingError(err.message);
    throw err;
  }
}

async function getMediaPermalink(igMediaId, accessToken) {
  try {
    const result = await new MetaClient(accessToken).get(igMediaId, { fields: "permalink" });
    return result.permalink;
  } catch (err) {
    if (err instanceof MetaAPIError) throw new PublishingError(err.message);
    throw err;
  }
}

module.exports = {
  publishPost, publishReel, getMediaPermalink, pollContainerStatus,
  PublishingError, PublishingDisabledError,
};
