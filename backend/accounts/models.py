from django.conf import settings
from django.db import models


class UserSettings(models.Model):
    """Per-user scheduling defaults and notification preferences."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="settings"
    )
    default_timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    default_publish_time = models.TimeField(default="09:00")

    notify_scheduled = models.BooleanField(default=True)
    notify_failed = models.BooleanField(default=True)
    notify_published = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings for {self.user.username}"
