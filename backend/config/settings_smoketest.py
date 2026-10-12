"""
NOT used for the POC verification — MySQL is the real target database.

This override exists only so we can run a fast local smoke test of the
Django/DRF code (migrations apply, views import, serializers validate)
before Docker/MySQL is available, to catch plain Python bugs early.
The POC_TEST_REPORT.md must still verify everything against real MySQL.
"""

from .settings import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "smoketest.sqlite3",  # noqa: F405
    }
}
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
