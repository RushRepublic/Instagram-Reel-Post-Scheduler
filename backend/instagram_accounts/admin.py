from django.contrib import admin

from .models import InstagramAccount


@admin.register(InstagramAccount)
class InstagramAccountAdmin(admin.ModelAdmin):
    list_display = ["username", "user", "instagram_user_id", "account_type", "is_active", "has_token", "connected_at"]
    exclude = ["access_token"]
    readonly_fields = ["instagram_user_id", "facebook_page_id", "connected_at", "created_at", "updated_at"]

    @admin.display(boolean=True, description="Has token")
    def has_token(self, obj):
        return bool(obj.access_token)
