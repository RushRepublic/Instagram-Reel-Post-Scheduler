from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from .models import UserSettings
from .serializers import UserSerializer, UserSettingsSerializer


class LoginView(APIView):
    """POST /api/auth/login/ — email + password -> JWT access/refresh + user."""

    permission_classes = [AllowAny]

    def post(self, request):
        email = (request.data.get("email") or "").strip()
        password = request.data.get("password") or ""

        if not email or not password:
            return Response(
                {"detail": "Email and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Users are provisioned with username == email (see seed_demo_user command).
        user = authenticate(request, username=email, password=password)
        if user is None:
            return Response(
                {"detail": "Invalid email or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": UserSerializer(user).data,
            }
        )


class LogoutView(APIView):
    """POST /api/auth/logout/ — blacklists the given refresh token."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response(
                {"detail": "Invalid or already-expired refresh token."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    """GET /api/auth/me/ — current user + settings. PATCH updates settings."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        return Response(
            {
                "user": UserSerializer(request.user).data,
                "settings": UserSettingsSerializer(settings_obj).data,
            }
        )

    def patch(self, request):
        # first_name/email live on the Django User model; everything else
        # (timezone, default time, notification flags) lives on UserSettings.
        # A single PATCH here can update either or both in one call.
        user = request.user
        user_fields_changed = False
        if "first_name" in request.data:
            user.first_name = request.data["first_name"]
            user_fields_changed = True
        if "email" in request.data:
            user.email = request.data["email"]
            user_fields_changed = True
        if user_fields_changed:
            user.save(update_fields=["first_name", "email"])

        settings_obj, _ = UserSettings.objects.get_or_create(user=user)
        settings_data = {
            k: v for k, v in request.data.items()
            if k in UserSettingsSerializer.Meta.fields
        }
        if settings_data:
            serializer = UserSettingsSerializer(settings_obj, data=settings_data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            settings_obj = serializer.instance

        return Response(
            {
                "user": UserSerializer(user).data,
                "settings": UserSettingsSerializer(settings_obj).data,
            }
        )
