from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from instagram_accounts.services.insights_service import InsightsError, get_media_insights
from scheduler.models import ScheduledContent

from .models import InstagramInsight


class AnalyticsView(APIView):
    """
    GET /api/analytics/?account=@handle

    For each PUBLISHED item on the account, attempts a live Graph API
    insights fetch. Every entry in the response is explicitly tagged with
    its `source`:

      - "META_API"    real values just fetched from Instagram
      - "CACHED"      real values from a previous successful fetch (no
                       live call made this request)
      - "UNAVAILABLE" no real data could be obtained (not yet published,
                       API error, or missing permission) — values are null,
                       never a fabricated number.

    This endpoint never mixes mock numbers into a payload labeled real.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        account = request.query_params.get("account")

        qs = ScheduledContent.objects.filter(
            user=request.user, status=ScheduledContent.STATUS_PUBLISHED
        ).select_related("instagram_account", "media")
        if account:
            qs = qs.filter(instagram_account__username=account.lstrip("@"))

        results = []
        for content in qs:
            results.append(self._insight_entry(content))

        return Response({"account": account, "results": results})

    def _insight_entry(self, content):
        base = {
            "content_id": content.id,
            "content_type": content.content_type,
            "instagram_media_id": content.instagram_media_id,
            "published_at": content.published_at,
        }

        if not content.instagram_media_id:
            return {**base, "source": "UNAVAILABLE", "reason": "Not published yet.", "metrics": None}

        access_token = content.instagram_account.access_token
        try:
            live_values = get_media_insights(
                content.instagram_media_id,
                access_token,
                is_video=(content.content_type == "REEL"),
            )
        except InsightsError as exc:
            cached = InstagramInsight.objects.filter(content=content).first()
            if cached:
                return {**base, "source": "CACHED", "reason": str(exc), "metrics": _serialize(cached)}
            return {**base, "source": "UNAVAILABLE", "reason": str(exc), "metrics": None}

        insight = InstagramInsight.objects.create(
            content=content,
            reach=live_values.get("reach"),
            impressions=live_values.get("impressions"),
            likes=live_values.get("likes"),
            comments=live_values.get("comments"),
            shares=live_values.get("shares"),
            saves=live_values.get("saved"),
            plays=live_values.get("plays"),
        )
        return {**base, "source": "META_API", "reason": None, "metrics": _serialize(insight)}


def _serialize(insight):
    return {
        "reach": insight.reach,
        "impressions": insight.impressions,
        "likes": insight.likes,
        "comments": insight.comments,
        "shares": insight.shares,
        "saves": insight.saves,
        "plays": insight.plays,
        "recorded_at": insight.recorded_at,
    }
