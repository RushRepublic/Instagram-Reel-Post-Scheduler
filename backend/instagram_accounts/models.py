from django.conf import settings
from django.db import models

from .fields import EncryptedTextField


class InstagramAccount(models.Model):
    """
    An Instagram Professional (Business/Creator) account connected via the
    Facebook Login for Business flow. access_token is encrypted at rest and
    must never be serialized to the frontend — see serializers.py.
    """

    ACCOUNT_TYPE_CHOICES = [
        ("BUSINESS", "Business"),
        ("CREATOR", "Creator"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="instagram_accounts"
    )

    username = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255, blank=True)
    instagram_user_id = models.CharField(max_length=64, unique=True)
    facebook_page_id = models.CharField(max_length=64)
    # max_length=1000: Django's URLField defaults to 200 chars, but real
    # Instagram/Facebook CDN profile picture URLs are long signed URLs
    # that routinely exceed that (hit in production: MySQL error 1406).
    profile_picture_url = models.URLField(blank=True, max_length=1000)
    account_type = models.CharField(max_length=16, choices=ACCOUNT_TYPE_CHOICES, default="BUSINESS")

    # Encrypted; never exposed via API. Page-scoped access token used for
    # both the Instagram Graph API publishing calls and insight lookups.
    access_token = EncryptedTextField(blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True)
    connected_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-connected_at"]

    def __str__(self):
        return f"@{self.username} ({self.user.username})"
