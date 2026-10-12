"""
Facebook Login for Business OAuth orchestration.

Flow (per Meta's current documentation):
  1. React redirects the user to Facebook's OAuth dialog (frontend builds
     this URL using META_APP_ID; scopes: pages_show_list,
     instagram_basic, instagram_content_publish, pages_read_engagement,
     business_management).
  2. Facebook redirects back to META_REDIRECT_URI with ?code=...
  3. Backend (this module) exchanges the code for a short-lived user
     token, upgrades it to a long-lived token, lists the Pages the user
     manages, and for each Page looks up its linked
     instagram_business_account.
  4. One InstagramAccount row is created/updated per linked IG account,
     storing the *Page* access token (not the user token) since that's
     what's used for publishing/insights calls against the IG account.
"""

import logging

from django.utils import timezone

from instagram_accounts.models import InstagramAccount

from .meta_client import MetaAPIError, MetaClient

logger = logging.getLogger(__name__)


class AccountConnectionError(Exception):
    pass


def connect_instagram_accounts_for_user(user, code, redirect_uri):
    """
    Runs the full OAuth -> Page -> linked IG account discovery flow and
    upserts an InstagramAccount row per linked IG Business/Creator account
    found among the Pages this user administers.

    Returns (connected, skipped) — connected is the list of InstagramAccount
    instances saved; skipped is a list of {"page_name", "page_id", "reason"}
    dicts for every Page that did NOT get connected, so the caller (and
    whoever's debugging) can see exactly which Pages were left out and why,
    instead of them silently disappearing.
    """
    client = MetaClient()

    try:
        token_response = client.exchange_code_for_token(code, redirect_uri)
        short_lived_token = token_response["access_token"]

        long_lived_response = client.exchange_for_long_lived_token(short_lived_token)
        user_token = long_lived_response["access_token"]
        expires_in = long_lived_response.get("expires_in")  # seconds, ~60 days

        pages = client.get_user_pages(user_token)  # already the full, paginated list
    except MetaAPIError as exc:
        raise AccountConnectionError(str(exc)) from exc

    connected = []
    skipped = []
    expires_at = None
    if expires_in:
        expires_at = timezone.now() + timezone.timedelta(seconds=int(expires_in))

    logger.info("Connect flow: found %d Facebook Page(s) for user_id=%s", len(pages), user.id)

    for page in pages:
        page_id = page["id"]
        page_name = page.get("name", "(unnamed)")
        page_access_token = page["access_token"]

        try:
            ig_response = client.get_linked_instagram_account(page_id, page_access_token)
        except MetaAPIError as exc:
            reason = f"Graph API error looking up linked Instagram account: {exc}"
            logger.warning("Skipped Page '%s' (%s): %s", page_name, page_id, reason)
            skipped.append({"page_name": page_name, "page_id": page_id, "reason": reason})
            continue

        ig_account = ig_response.get("instagram_business_account")
        if not ig_account:
            reason = "No Instagram Professional (Business/Creator) account linked to this Page."
            logger.info("Skipped Page '%s' (%s): %s", page_name, page_id, reason)
            skipped.append({"page_name": page_name, "page_id": page_id, "reason": reason})
            continue

        account, _created = InstagramAccount.objects.update_or_create(
            instagram_user_id=ig_account["id"],
            defaults={
                "user": user,
                "username": ig_account.get("username", ""),
                "display_name": ig_account.get("name", ""),
                "facebook_page_id": page_id,
                "profile_picture_url": ig_account.get("profile_picture_url", ""),
                "access_token": page_access_token,
                "token_expires_at": expires_at,
                "is_active": True,
            },
        )
        connected.append(account)

    logger.info(
        "Connect flow complete for user_id=%s: %d connected, %d skipped",
        user.id, len(connected), len(skipped),
    )
    return connected, skipped
