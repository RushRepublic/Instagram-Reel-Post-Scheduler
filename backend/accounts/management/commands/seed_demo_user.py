from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from accounts.models import UserSettings

DEMO_EMAIL = "admin@rushrepublic.com"
DEMO_PASSWORD = "admin123"


class Command(BaseCommand):
    help = "Creates the demo admin user matching the React frontend's login form."

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username=DEMO_EMAIL,
            defaults={"email": DEMO_EMAIL, "first_name": "Admin", "is_staff": True, "is_superuser": True},
        )
        user.set_password(DEMO_PASSWORD)
        user.is_staff = True
        user.is_superuser = True
        user.save()

        UserSettings.objects.get_or_create(user=user)

        verb = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{verb} demo user: {DEMO_EMAIL} / {DEMO_PASSWORD}"))
