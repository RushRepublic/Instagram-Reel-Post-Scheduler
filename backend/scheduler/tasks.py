import logging

from celery import shared_task
from django.conf import settings
from django.utils import timezone as dj_timezone

from instagram_accounts.services import publishing_service
from instagram_accounts.services.meta_client import MetaAPIError
from instagram_accounts.services.publishing_service import PublishingDisabledError, PublishingError

logger = logging.getLogger(__name__)


def _build_public_media_url(media_file):
    if not settings.PUBLIC_MEDIA_BASE_URL:
        return media_file.file.url  # relative — will fail _require_public_url, by design
    base = settings.PUBLIC_MEDIA_BASE_URL.rstrip("/")
    return f"{base}{media_file.file.url}"


@shared_task(bind=True, max_retries=0)
def publish_scheduled_content(self, content_id):
    """
    The single entry point for turning a ScheduledContent row into a real
    (or, while META_PUBLISHING_ENABLED=False, deliberately blocked)
    Instagram publish call. Runs on the Celery worker — independent of
    whether the React app or the browser that created the schedule is
    still open.
    """
    # Imported here (not at module scope) to avoid a circular import with
    # views.py, which imports this task.
    from .models import ScheduledContent

    try:
        content = ScheduledContent.objects.select_related("instagram_account", "media").get(id=content_id)
    except ScheduledContent.DoesNotExist:
        logger.error("publish_scheduled_content: content_id=%s not found", content_id)
        return

    if content.status == ScheduledContent.STATUS_CANCELLED:
        logger.info("content_id=%s was cancelled before publish — skipping.", content_id)
        return

    if content.status == ScheduledContent.STATUS_PUBLISHED:
        logger.info("content_id=%s already published — skipping duplicate task run.", content_id)
        return

    account = content.instagram_account
    if not account or not account.is_active:
        _mark_failed(content, "Instagram account is not connected or was deactivated.")
        return

    if not account.access_token:
        _mark_failed(content, "Instagram account has no stored access token.")
        return

    content.status = ScheduledContent.STATUS_PROCESSING
    content.save(update_fields=["status", "updated_at"])

    media_url = _build_public_media_url(content.media)

    try:
        if content.content_type == "POST":
            result = publishing_service.publish_post(
                ig_user_id=account.instagram_user_id,
                access_token=account.access_token,
                image_url=media_url,
                caption=content.caption,
            )
        else:  # REEL
            result = publishing_service.publish_reel(
                ig_user_id=account.instagram_user_id,
                access_token=account.access_token,
                video_url=media_url,
                caption=content.caption,
            )
    except PublishingDisabledError as exc:
        _mark_failed(content, str(exc))
        return
    except (PublishingError, MetaAPIError) as exc:
        _mark_failed(content, str(exc))
        return
    except Exception as exc:  # network errors, timeouts, etc.
        logger.exception("Unexpected error publishing content_id=%s", content_id)
        _mark_failed(content, f"Unexpected error: {exc}")
        return

    content.instagram_media_id = result["instagram_media_id"]
    content.meta_container_id = result.get("meta_container_id", "")

    try:
        permalink = publishing_service.get_media_permalink(result["instagram_media_id"], account.access_token)
        content.instagram_permalink = permalink or ""
    except PublishingError:
        # Publish itself succeeded; permalink lookup failing shouldn't flip
        # this back to FAILED — log and move on.
        logger.warning("Published content_id=%s but could not fetch permalink.", content_id)

    content.status = ScheduledContent.STATUS_PUBLISHED
    content.published_at = dj_timezone.now()
    content.save(
        update_fields=[
            "instagram_media_id",
            "meta_container_id",
            "instagram_permalink",
            "status",
            "published_at",
            "updated_at",
        ]
    )
    logger.info("content_id=%s published successfully -> media_id=%s", content_id, content.instagram_media_id)


def _mark_failed(content, reason):
    from .models import ScheduledContent

    content.status = ScheduledContent.STATUS_FAILED
    content.failure_reason = reason
    content.failed_at = dj_timezone.now()
    content.save(update_fields=["status", "failure_reason", "failed_at", "updated_at"])
    logger.error("content_id=%s FAILED: %s", content.id, reason)
