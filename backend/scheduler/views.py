from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone as dj_timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MediaFile, ScheduledContent
from .serializers import ScheduledContentCreateSerializer, ScheduledContentSerializer
from .tasks import publish_scheduled_content


def _kind_for_content_type(content_type):
    return "IMAGE" if content_type == "POST" else "VIDEO"


class ContentListCreateView(APIView):
    """
    GET  /api/content/?status=&content_type=&account=&search=
    POST /api/content/  (multipart/form-data)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ScheduledContent.objects.filter(user=request.user).select_related(
            "instagram_account", "media"
        )

        status_param = request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param.upper())

        content_type = request.query_params.get("content_type")
        if content_type:
            qs = qs.filter(content_type=content_type.upper())

        account = request.query_params.get("account")
        if account:
            qs = qs.filter(instagram_account__username=account.lstrip("@"))

        search = request.query_params.get("search")
        if search:
            qs = qs.filter(Q(caption__icontains=search) | Q(instagram_account__username__icontains=search))

        serializer = ScheduledContentSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        serializer = ScheduledContentCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        uploaded_file = data["media"]
        media = MediaFile.objects.create(
            uploaded_by=request.user,
            file=uploaded_file,
            kind=_kind_for_content_type(data["content_type"]),
            original_filename=uploaded_file.name,
            size_bytes=uploaded_file.size,
        )

        scheduled_at = data["scheduled_at"] if not data["publish_now"] else dj_timezone.now()

        content = ScheduledContent.objects.create(
            user=request.user,
            instagram_account=data["instagram_account"],
            content_type=data["content_type"],
            caption=data["caption"],
            media=media,
            scheduled_at=scheduled_at,
            timezone=data["timezone"],
            status=ScheduledContent.STATUS_SCHEDULED,
        )

        if data["publish_now"]:
            async_result = publish_scheduled_content.apply_async(args=[content.id])
        else:
            async_result = publish_scheduled_content.apply_async(args=[content.id], eta=scheduled_at)

        content.celery_task_id = async_result.id
        content.save(update_fields=["celery_task_id"])

        out = ScheduledContentSerializer(content, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class ContentDetailView(APIView):
    """GET/PATCH /api/content/{id}/ — edit only while still SCHEDULED."""

    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_object_or_404(ScheduledContent, pk=pk, user=request.user)

    def get(self, request, pk):
        content = self.get_object(request, pk)
        return Response(ScheduledContentSerializer(content, context={"request": request}).data)

    def patch(self, request, pk):
        content = self.get_object(request, pk)

        if content.status != ScheduledContent.STATUS_SCHEDULED:
            return Response(
                {"detail": f"Cannot edit content with status {content.status}."},
                status=status.HTTP_409_CONFLICT,
            )

        caption = request.data.get("caption")
        if caption is not None:
            content.caption = caption

        new_scheduled_at = request.data.get("scheduled_at")
        reschedule = False
        if new_scheduled_at:
            parsed = parse_datetime(new_scheduled_at)
            if parsed is None:
                return Response({"scheduled_at": "Invalid datetime."}, status=status.HTTP_400_BAD_REQUEST)
            if dj_timezone.is_naive(parsed):
                parsed = dj_timezone.make_aware(parsed)
            if parsed <= dj_timezone.now():
                return Response(
                    {"scheduled_at": "Scheduled time must be in the future."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            content.scheduled_at = parsed
            reschedule = True

        tz = request.data.get("timezone")
        if tz:
            content.timezone = tz

        content.save()

        if reschedule:
            # Original Celery ETA can't be changed in place — re-queue.
            async_result = publish_scheduled_content.apply_async(
                args=[content.id], eta=content.scheduled_at
            )
            content.celery_task_id = async_result.id
            content.save(update_fields=["celery_task_id"])

        return Response(ScheduledContentSerializer(content, context={"request": request}).data)


class CancelContentView(APIView):
    """POST /api/content/{id}/cancel/ — status -> CANCELLED, record kept."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        content = get_object_or_404(ScheduledContent, pk=pk, user=request.user)

        if content.status not in (ScheduledContent.STATUS_SCHEDULED, ScheduledContent.STATUS_DRAFT):
            return Response(
                {"detail": f"Cannot cancel content with status {content.status}."},
                status=status.HTTP_409_CONFLICT,
            )

        content.status = ScheduledContent.STATUS_CANCELLED
        content.save(update_fields=["status", "updated_at"])
        # The Celery task itself checks status before publishing (see tasks.py),
        # so a cancelled item is a safe no-op even if its ETA already fired.
        return Response(ScheduledContentSerializer(content, context={"request": request}).data)


class RetryContentView(APIView):
    """POST /api/content/{id}/retry/ — re-run the publish flow for FAILED content."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        content = get_object_or_404(ScheduledContent, pk=pk, user=request.user)

        if content.status != ScheduledContent.STATUS_FAILED:
            return Response(
                {"detail": f"Can only retry FAILED content (current status: {content.status})."},
                status=status.HTTP_409_CONFLICT,
            )

        if content.instagram_media_id:
            # Meta already accepted a publish for this content on a prior
            # attempt — do not publish it again.
            content.status = ScheduledContent.STATUS_PUBLISHED
            content.save(update_fields=["status", "updated_at"])
            return Response(ScheduledContentSerializer(content, context={"request": request}).data)

        content.status = ScheduledContent.STATUS_SCHEDULED
        content.failure_reason = ""
        content.failed_at = None
        content.save(update_fields=["status", "failure_reason", "failed_at", "updated_at"])

        async_result = publish_scheduled_content.apply_async(args=[content.id])
        content.celery_task_id = async_result.id
        content.save(update_fields=["celery_task_id"])

        return Response(ScheduledContentSerializer(content, context={"request": request}).data)


class DashboardView(APIView):
    """GET /api/dashboard/"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ScheduledContent.objects.filter(user=request.user)

        upcoming = (
            qs.filter(status=ScheduledContent.STATUS_SCHEDULED)
            .select_related("instagram_account", "media")
            .order_by("scheduled_at")[:4]
        )

        return Response(
            {
                "scheduled_count": qs.filter(status=ScheduledContent.STATUS_SCHEDULED).count(),
                "published_count": qs.filter(status=ScheduledContent.STATUS_PUBLISHED).count(),
                "failed_count": qs.filter(status=ScheduledContent.STATUS_FAILED).count(),
                "connected_accounts_count": request.user.instagram_accounts.filter(is_active=True).count(),
                "upcoming_content": ScheduledContentSerializer(
                    upcoming, many=True, context={"request": request}
                ).data,
            }
        )


class CalendarView(APIView):
    """GET /api/calendar/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&account=@handle"""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = ScheduledContent.objects.filter(user=request.user).select_related(
            "instagram_account", "media"
        )

        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        if start_date:
            qs = qs.filter(scheduled_at__date__gte=start_date)
        if end_date:
            qs = qs.filter(scheduled_at__date__lte=end_date)

        account = request.query_params.get("account")
        if account:
            qs = qs.filter(instagram_account__username=account.lstrip("@"))

        serializer = ScheduledContentSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)
