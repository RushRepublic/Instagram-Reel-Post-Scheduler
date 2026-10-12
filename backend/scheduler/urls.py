from django.urls import path

from .views import (
    CalendarView,
    CancelContentView,
    ContentDetailView,
    ContentListCreateView,
    DashboardView,
    RetryContentView,
)

urlpatterns = [
    path("content/", ContentListCreateView.as_view(), name="content-list-create"),
    path("content/<int:pk>/", ContentDetailView.as_view(), name="content-detail"),
    path("content/<int:pk>/cancel/", CancelContentView.as_view(), name="content-cancel"),
    path("content/<int:pk>/retry/", RetryContentView.as_view(), name="content-retry"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("calendar/", CalendarView.as_view(), name="calendar"),
]
