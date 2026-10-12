from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone as dj_timezone
from rest_framework import serializers

from instagram_accounts.models import InstagramAccount
from instagram_accounts.serializers import InstagramAccountSerializer

from .models import MediaFile, ScheduledContent
from .validators import validate_media_file


class MediaFileSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = MediaFile
        fields = ["id", "url", "kind", "original_filename", "size_bytes", "duration_seconds"]

    def get_url(self, obj):
        request = self.context.get("request")
        if not obj.file:
            return None
        return request.build_absolute_uri(obj.file.url) if request else obj.file.url


class ScheduledContentSerializer(serializers.ModelSerializer):
    """Read serializer — what the React app's list/calendar/dashboard views consume."""

    instagram_account = InstagramAccountSerializer(read_only=True)
    media = MediaFileSerializer(read_only=True)

    class Meta:
        model = ScheduledContent
        fields = [
            "id",
            "content_type",
            "instagram_account",
            "caption",
            "media",
            "scheduled_at",
            "timezone",
            "status",
            "instagram_media_id",
            "instagram_permalink",
            "meta_container_id",
            "published_at",
            "failed_at",
            "failure_reason",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ScheduledContentCreateSerializer(serializers.Serializer):
    """
    Write serializer for POST /api/content/ (multipart/form-data).
    Deliberately a plain Serializer (not ModelSerializer) since the
    incoming shape (media file + publish_now flag) doesn't map 1:1 onto
    the model.
    """

    instagram_account = serializers.PrimaryKeyRelatedField(queryset=InstagramAccount.objects.none())
    content_type = serializers.ChoiceField(choices=ScheduledContent.CONTENT_TYPE_CHOICES)
    caption = serializers.CharField(allow_blank=True, max_length=2200, required=False, default="")
    media = serializers.FileField()
    # Deliberately a plain string, not DRF's DateTimeField: the value is a
    # WALL-CLOCK date/time ("2026-10-05T19:30") that must be interpreted in
    # the `timezone` field below, not in Django's default TIME_ZONE (UTC).
    scheduled_at = serializers.CharField()
    timezone = serializers.CharField(max_length=64, default="Asia/Kolkata")
    publish_now = serializers.BooleanField(required=False, default=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            self.fields["instagram_account"].queryset = InstagramAccount.objects.filter(
                user=request.user, is_active=True
            )

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise serializers.ValidationError(f"Unknown timezone '{value}'.") from exc
        return value

    def validate(self, attrs):
        # Parse the wall-clock "scheduled_at" string as local time IN the
        # given IANA timezone, then convert to an aware UTC datetime for
        # storage — this is what actually makes "28 Sep, 7:30 PM,
        # Asia/Kolkata" mean the correct instant rather than 7:30 PM UTC.
        try:
            naive = datetime.fromisoformat(attrs["scheduled_at"].replace("Z", ""))
        except ValueError as exc:
            raise serializers.ValidationError({"scheduled_at": "Invalid date/time format."}) from exc

        tzinfo = ZoneInfo(attrs["timezone"])
        aware = naive.replace(tzinfo=tzinfo) if dj_timezone.is_naive(naive) else naive.astimezone(tzinfo)
        attrs["scheduled_at"] = aware

        if not attrs.get("publish_now") and aware <= dj_timezone.now():
            raise serializers.ValidationError({"scheduled_at": "Scheduled time must be in the future."})

        try:
            validate_media_file(attrs["media"], attrs["content_type"])
        except Exception as exc:  # django ValidationError -> DRF ValidationError
            raise serializers.ValidationError({"media": str(exc)}) from exc

        return attrs
