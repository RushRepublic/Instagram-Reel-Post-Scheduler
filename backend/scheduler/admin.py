from django.contrib import admin

from .models import MediaFile, ScheduledContent


@admin.register(ScheduledContent)
class ScheduledContentAdmin(admin.ModelAdmin):
    list_display = ["id", "content_type", "instagram_account", "status", "scheduled_at", "published_at"]
    list_filter = ["status", "content_type"]
    search_fields = ["caption", "instagram_account__username"]


@admin.register(MediaFile)
class MediaFileAdmin(admin.ModelAdmin):
    list_display = ["id", "original_filename", "kind", "size_bytes", "created_at"]
