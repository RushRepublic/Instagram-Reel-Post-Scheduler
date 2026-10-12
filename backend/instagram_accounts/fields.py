"""
Encrypted-at-rest storage for Instagram access tokens.

Uses Fernet (symmetric, authenticated encryption) keyed off
settings.FIELD_ENCRYPTION_KEY. The key must never be committed —
it lives in .env (FIELD_ENCRYPTION_KEY), separate from DJANGO_SECRET_KEY
so it can be rotated independently.
"""

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _get_fernet():
    key = getattr(settings, "FIELD_ENCRYPTION_KEY", "") or ""
    if not key:
        # Dev fallback so `manage.py check`/migrations don't hard-fail before
        # a key is generated. Tokens saved under this fallback are NOT
        # portable across processes — always set a real key before storing
        # real tokens.
        key = Fernet.generate_key().decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


class EncryptedTextField(models.TextField):
    """Transparently encrypts on save, decrypts on read. Never logged in plaintext."""

    def get_prep_value(self, value):
        if value is None or value == "":
            return value
        f = _get_fernet()
        return f.encrypt(value.encode()).decode()

    def from_db_value(self, value, expression, connection):
        if value is None or value == "":
            return value
        f = _get_fernet()
        try:
            return f.decrypt(value.encode()).decode()
        except InvalidToken:
            # Key rotated or value predates encryption — surface as empty
            # rather than crashing every read.
            return ""
