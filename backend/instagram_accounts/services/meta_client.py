"""
Thin, low-level wrapper around the Meta Graph API.

Nothing in this module knows about Django models — it only knows how to
make authenticated HTTP requests to graph.facebook.com and raise a
consistent exception on error. Higher-level orchestration (OAuth exchange,
container polling, publish sequencing) lives in the sibling *_service.py
modules.

Docs: https://developers.facebook.com/docs/graph-api
"""

import requests
from django.conf import settings


class MetaAPIError(Exception):
    """Raised for any non-2xx response from the Graph API."""

    def __init__(self, message, status_code=None, payload=None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


class MetaClient:
    def __init__(self, access_token=None):
        self.access_token = access_token
        self.api_version = settings.META_API_VERSION
        self.base_url = f"https://graph.facebook.com/{self.api_version}"

    # ---------------------------------------------------------------- core

    def _request(self, method, path, params=None, data=None, files=None):
        url = f"{self.base_url}/{path.lstrip('/')}"
        params = dict(params or {})
        if self.access_token and "access_token" not in params:
            params["access_token"] = self.access_token

        response = requests.request(method, url, params=params, data=data, files=files, timeout=30)

        try:
            payload = response.json()
        except ValueError:
            payload = {"raw": response.text}

        if response.status_code >= 400:
            message = payload.get("error", {}).get("message", "Unknown Meta API error")
            raise MetaAPIError(message, status_code=response.status_code, payload=payload)

        return payload

    def get(self, path, params=None):
        return self._request("GET", path, params=params)

    def get_all_pages(self, path, params=None, max_pages=20):
        """
        Follows Graph API cursor pagination (`paging.next`) until exhausted,
        returning the combined `data` list from every page.

        Without this, any list endpoint (e.g. me/accounts) silently returns
        only its first page — Meta's default page size is 25, so an account
        managing 50+ Pages would see fewer than half of them with a single
        unpaginated call. max_pages is a hard safety cap against runaway
        loops if Meta ever returns a malformed/looping `next` cursor.
        """
        all_data = []
        next_url = None
        current_params = dict(params or {})
        current_params.setdefault("limit", 100)

        for _ in range(max_pages):
            if next_url:
                response = requests.get(next_url, timeout=30).json()
            else:
                response = self._request("GET", path, params=current_params)

            if "error" in response:
                message = response.get("error", {}).get("message", "Unknown Meta API error")
                raise MetaAPIError(message, payload=response)

            all_data.extend(response.get("data", []))

            next_url = response.get("paging", {}).get("next")
            if not next_url:
                break

        return all_data

    def post(self, path, data=None, params=None, files=None):
        return self._request("POST", path, params=params, data=data, files=files)

    # -------------------------------------------------------- OAuth helpers

    def exchange_code_for_token(self, code, redirect_uri):
        """Authorization code -> short-lived user access token."""
        return self._request(
            "GET",
            "oauth/access_token",
            params={
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "redirect_uri": redirect_uri,
                "code": code,
            },
        )

    def exchange_for_long_lived_token(self, short_lived_token):
        """Short-lived user token -> long-lived (~60 day) user token."""
        return self._request(
            "GET",
            "oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.META_APP_ID,
                "client_secret": settings.META_APP_SECRET,
                "fb_exchange_token": short_lived_token,
            },
        )

    def get_user_pages(self, user_access_token):
        """
        Every Page the user manages, each with its own page access token —
        paginated, so this returns ALL pages, not just the first ~25.
        """
        client = MetaClient(user_access_token)
        return client.get_all_pages("me/accounts", params={"fields": "id,name,access_token"})

    def get_linked_instagram_account(self, page_id, page_access_token):
        client = MetaClient(page_access_token)
        return client.get(
            page_id,
            params={"fields": "instagram_business_account{id,username,name,profile_picture_url}"},
        )
