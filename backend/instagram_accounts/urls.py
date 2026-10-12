from django.urls import path

from .views import (
    InstagramAccountDetailView,
    InstagramAccountListView,
    OAuthCallbackView,
    OAuthStartView,
)

urlpatterns = [
    path("accounts/", InstagramAccountListView.as_view(), name="instagram-account-list"),
    path("accounts/<int:pk>/", InstagramAccountDetailView.as_view(), name="instagram-account-detail"),
    path("oauth/start/", OAuthStartView.as_view(), name="instagram-oauth-start"),
    path("oauth/callback/", OAuthCallbackView.as_view(), name="instagram-oauth-callback"),
]
