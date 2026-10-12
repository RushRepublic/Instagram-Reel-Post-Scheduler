from rest_framework import serializers

from .models import InstagramAccount


class InstagramAccountSerializer(serializers.ModelSerializer):
    """
    access_token and token_expires_at are intentionally excluded.
    This is the only serializer that should ever represent an
    InstagramAccount to the frontend.
    """

    class Meta:
        model = InstagramAccount
        fields = [
            "id",
            "username",
            "display_name",
            "instagram_user_id",
            "facebook_page_id",
            "profile_picture_url",
            "account_type",
            "is_active",
            "connected_at",
        ]
        read_only_fields = fields
