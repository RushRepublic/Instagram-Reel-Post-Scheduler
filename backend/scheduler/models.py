from django.conf import settings
from django.db import models

from instagram_accounts.models import InstagramAccount


def upload_media_path(instance, filename):
    return f"content/{instance.uploaded_by_id}/{filename}"


class MediaFile(models.Model):
    """An uploaded image/video, stored via Django's file storage (MEDIA_ROOT)."""

    KIND_CHOICES = [("IMAGE", "Image"), ("VIDEO", "Video")]

    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    file = models.FileField(upload_to=upload_media_path)
    kind = models.CharField(max_length=8, choices=KIND_CHOICES)
    original_filename = models.CharField(max_length=255)
    size_bytes = models.PositiveBigIntegerField()
    duration_seconds = models.FloatField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.original_filename


class ScheduledContent(models.Model):
    CONTENT_TYPE_CHOICES = [("POST", "Post"), ("REEL", "Reel")]

    STATUS_DRAFT = "DRAFT"
    STATUS_SCHEDULED = "SCHEDULED"
    STATUS_PROCESSING = "PROCESSING"
    STATUS_PUBLISHED = "PUBLISHED"
    STATUS_FAILED = "FAILED"
    STATUS_CANCELLED = "CANCELLED"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_SCHEDULED, "Scheduled"),
        (STATUS_PROCESSING, "Processing"),
        (STATUS_PUBLISHED, "Published"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="scheduled_content")
    instagram_account = models.ForeignKey(
        InstagramAccount, on_delete=models.CASCADE, related_name="scheduled_content"
    )
    content_type = models.CharField(max_length=8, choices=CONTENT_TYPE_CHOICES)
    caption = models.TextField(blank=True)
    media = models.ForeignKey(MediaFile, on_delete=models.PROTECT, related_name="scheduled_content")

    scheduled_at = models.DateTimeField(help_text="Stored in UTC; always timezone-aware.")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata", help_text="IANA tz name for display.")

    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_SCHEDULED)

    # Populated once a Celery task starts/finishes the publish attempt.
    celery_task_id = models.CharField(max_length=255, blank=True)
    meta_container_id = models.CharField(max_length=64, blank=True)
    instagram_media_id = models.CharField(max_length=64, blank=True)
    instagram_permalink = models.URLField(blank=True)

    published_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-scheduled_at"]
        indexes = [
            models.Index(fields=["status", "scheduled_at"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"{self.content_type} @{self.instagram_account.username} — {self.status}"
