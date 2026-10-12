"""
Instagram media insights (Graph API).

Metric availability depends on media type and the account's permissions —
see https://developers.facebook.com/docs/instagram-api/guides/insights.
This module fetches whatever metrics the API grants and returns them as a
plain dict; it never fabricates values for metrics the API doesn't return.
"""

from .meta_client import MetaAPIError, MetaClient


class InsightsError(Exception):
    pass


IMAGE_METRICS = ["reach", "impressions", "likes", "comments", "saved", "shares"]
VIDEO_METRICS = ["reach", "impressions", "likes", "comments", "saved", "shares", "plays"]


def get_media_insights(ig_media_id, access_token, is_video=False):
    """Returns real Graph API insight values for one published media item."""
    client = MetaClient(access_token)
    metrics = VIDEO_METRICS if is_video else IMAGE_METRICS

    try:
        result = client.get(f"{ig_media_id}/insights", params={"metric": ",".join(metrics)})
    except MetaAPIError as exc:
        raise InsightsError(str(exc)) from exc

    values = {}
    for entry in result.get("data", []):
        name = entry.get("name")
        entry_values = entry.get("values", [])
        if name and entry_values:
            values[name] = entry_values[0].get("value")

    return values
