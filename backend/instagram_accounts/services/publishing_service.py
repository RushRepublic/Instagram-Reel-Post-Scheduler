"""
Meta Graph API publishing flow for Instagram Posts and Reels.

Per Meta's current Content Publishing documentation, publishing is a
two-step process against the IG User node:

  1. POST /{ig-user-id}/media          -> creates a media *container*
     (image_url for Posts, video_url + media_type=REELS for Reels) and
     returns a creation_id.
  2. For video/Reels, the container is processed asynchronously — poll
     GET /{container-id}?fields=status_code until it reports FINISHED
     (or ERROR).
  3. POST /{ig-user-id}/media_publish  -> publishes the container using
     its creation_id, returning the final Instagram media id.

This module intentionally does not touch Django models — it takes plain
values in, returns plain values out, so it can be unit tested and reused
by both the Celery task and any manual/admin trigger.
"""

import time

from django.conf import settings

from .meta_client import MetaAPIError, MetaClient


class PublishingError(Exception):
    pass


class PublishingDisabledError(PublishingError):
    """Raised when META_PUBLISHING_ENABLED=False blocks a real API call."""


CONTAINER_POLL_INTERVAL_SECONDS = 5
CONTAINER_POLL_MAX_ATTEMPTS = 24  # ~2 minutes for images, extend for video below
VIDEO_POLL_MAX_ATTEMPTS = 60  # ~10 minutes, Reels processing can take a while


def _require_publishing_enabled():
    if not settings.META_PUBLISHING_ENABLED:
        raise PublishingDisabledError(
            "META_PUBLISHING_ENABLED is False. Set it to True in .env only after "
            "you have explicitly reviewed and authorized a live publish test."
        )


def _require_public_url(media_url):
    if not media_url.startswith("http://") and not media_url.startswith("https://"):
        raise PublishingError(
            "Media URL is not publicly accessible. Set PUBLIC_MEDIA_BASE_URL "
            "(e.g. an ngrok tunnel in dev) so Meta's servers can fetch the file."
        )
    if "localhost" in media_url or "127.0.0.1" in media_url:
        raise PublishingError(
            "Media URL points at localhost — Meta's servers cannot reach it. "
            "Set PUBLIC_MEDIA_BASE_URL to a publicly reachable tunnel/host."
        )


def publish_post(ig_user_id, access_token, image_url, caption):
    """Creates an image container and publishes it. Returns the Instagram media id."""
    _require_publishing_enabled()
    _require_public_url(image_url)

    client = MetaClient(access_token)

    try:
        container = client.post(
            f"{ig_user_id}/media",
            data={"image_url": image_url, "caption": caption},
        )
        creation_id = container["id"]

        publish_result = client.post(
            f"{ig_user_id}/media_publish",
            data={"creation_id": creation_id},
        )
    except MetaAPIError as exc:
        raise PublishingError(str(exc)) from exc

    return {
        "instagram_media_id": publish_result["id"],
        "meta_container_id": creation_id,
    }


def publish_reel(ig_user_id, access_token, video_url, caption):
    """
    Creates a REELS container, polls until Meta finishes processing the
    video, then publishes it. Returns the Instagram media id.
    """
    _require_publishing_enabled()
    _require_public_url(video_url)

    client = MetaClient(access_token)

    try:
        container = client.post(
            f"{ig_user_id}/media",
            data={"media_type": "REELS", "video_url": video_url, "caption": caption},
        )
        creation_id = container["id"]

        status_code = _poll_container_status(client, creation_id, max_attempts=VIDEO_POLL_MAX_ATTEMPTS)
        if status_code != "FINISHED":
            raise PublishingError(f"Reel container did not finish processing (status={status_code}).")

        publish_result = client.post(
            f"{ig_user_id}/media_publish",
            data={"creation_id": creation_id},
        )
    except MetaAPIError as exc:
        raise PublishingError(str(exc)) from exc

    return {
        "instagram_media_id": publish_result["id"],
        "meta_container_id": creation_id,
    }


def _poll_container_status(client, container_id, max_attempts):
    """Polls a media container's status_code until FINISHED, ERROR, or timeout."""
    for _attempt in range(max_attempts):
        result = client.get(container_id, params={"fields": "status_code"})
        status_code = result.get("status_code")
        if status_code in ("FINISHED", "ERROR"):
            return status_code
        time.sleep(CONTAINER_POLL_INTERVAL_SECONDS)
    raise PublishingError("Timed out waiting for media container to finish processing.")


def get_media_permalink(ig_media_id, access_token):
    """Fetches the permalink for a just-published media item, for verification."""
    client = MetaClient(access_token)
    try:
        result = client.get(ig_media_id, params={"fields": "permalink"})
    except MetaAPIError as exc:
        raise PublishingError(str(exc)) from exc
    return result.get("permalink")
