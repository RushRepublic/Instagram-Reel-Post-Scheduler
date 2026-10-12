from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.models import User
from django.core import signing
from django.http import HttpResponseRedirect
from rest_framework import status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import InstagramAccount
from .serializers import InstagramAccountSerializer
from .services.account_service import AccountConnectionError, connect_instagram_accounts_for_user

OAUTH_STATE_SALT = "instagram-oauth-state"
OAUTH_SCOPES = [
    "pages_show_list",
    "instagram_basic",
    "instagram_content_publish",
    "pages_read_engagement",
    "business_management",
]


class InstagramAccountListView(ListAPIView):
    """GET /api/instagram/accounts/ — only accounts the current user connected."""

    serializer_class = InstagramAccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return InstagramAccount.objects.filter(user=self.request.user, is_active=True)


class InstagramAccountDetailView(RetrieveAPIView):
    """GET /api/instagram/accounts/{id}/ — 404s if it belongs to another user."""

    serializer_class = InstagramAccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return InstagramAccount.objects.filter(user=self.request.user)


class OAuthStartView(APIView):
    """
    GET /api/instagram/oauth/start/ — returns the Facebook OAuth dialog URL
    for the frontend to redirect the browser to. `state` is a signed,
    tamper-proof token carrying the current user's id so the callback (a
    plain browser redirect with no JWT header) can identify who to attach
    the connected accounts to.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not settings.META_APP_ID:
            return Response(
                {"detail": "META_APP_ID is not configured on the backend."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        state = signing.dumps({"user_id": request.user.id}, salt=OAUTH_STATE_SALT)
        params = {
            "client_id": settings.META_APP_ID,
            "redirect_uri": settings.META_REDIRECT_URI,
            "state": state,
            "scope": ",".join(OAUTH_SCOPES),
            "response_type": "code",
        }
        auth_url = f"https://www.facebook.com/{settings.META_API_VERSION}/dialog/oauth?{urlencode(params)}"
        return Response({"auth_url": auth_url})


class OAuthCallbackView(APIView):
    """
    GET /api/instagram/oauth/callback/ — Facebook redirects here with
    ?code=...&state=.... Not JWT-authenticated (it's a browser redirect);
    identity comes from the signed `state` instead.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        accounts_page = f"{settings.FRONTEND_URL}/app/accounts"

        code = request.GET.get("code")
        state = request.GET.get("state")

        if not code or not state:
            return HttpResponseRedirect(f"{accounts_page}?connect_error=missing_code_or_state")

        try:
            state_data = signing.loads(state, salt=OAUTH_STATE_SALT, max_age=600)
        except signing.BadSignature:
            return HttpResponseRedirect(f"{accounts_page}?connect_error=invalid_state")

        try:
            user = User.objects.get(id=state_data["user_id"])
        except User.DoesNotExist:
            return HttpResponseRedirect(f"{accounts_page}?connect_error=unknown_user")

        try:
            connected, skipped = connect_instagram_accounts_for_user(
                user, code=code, redirect_uri=settings.META_REDIRECT_URI
            )
        except AccountConnectionError as exc:
            return HttpResponseRedirect(f"{accounts_page}?connect_error={urlencode({'msg': str(exc)})}")

        # Skipped Pages (no linked Instagram account, or a per-Page API error)
        # are surfaced by name in the UI instead of only being logged server-side.
        params = {"connected_count": len(connected), "skipped_count": len(skipped)}
        if skipped:
            params["skipped_names"] = ",".join(s["page_name"] for s in skipped)
        return HttpResponseRedirect(f"{accounts_page}?{urlencode(params)}")
