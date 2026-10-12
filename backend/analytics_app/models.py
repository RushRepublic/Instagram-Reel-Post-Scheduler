from django.db import models

from scheduler.models import ScheduledContent


class InstagramInsight(models.Model):
    """
    A snapshot of real Graph API insight values for one published item.
    Rows here are only ever written from a successful Graph API response
    (see services fetch_and_store_insights) — never fabricated.
    """

    content = models.ForeignKey(ScheduledContent, on_delete=models.CASCADE, related_name="insights")

    reach = models.PositiveIntegerField(null=True, blank=True)
    impressions = models.PositiveIntegerField(null=True, blank=True)
    likes = models.PositiveIntegerField(null=True, blank=True)
    comments = models.PositiveIntegerField(null=True, blank=True)
    shares = models.PositiveIntegerField(null=True, blank=True)
    saves = models.PositiveIntegerField(null=True, blank=True)
    plays = models.PositiveIntegerField(null=True, blank=True)

    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"Insight for content #{self.content_id} @ {self.recorded_at:%Y-%m-%d %H:%M}"
