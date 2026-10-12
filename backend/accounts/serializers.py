from django.contrib.auth.models import User
from rest_framework import serializers

from .models import UserSettings


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name"]


class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = [
            "default_timezone",
            "default_publish_time",
            "notify_scheduled",
            "notify_failed",
            "notify_published",
        ]
