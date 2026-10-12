"""
Upload validation — extension, declared MIME type, and file size.

We deliberately check the browser-declared content_type AND sniff the
actual file signature (via python-magic) so a renamed .exe can't pass
as a .mp4 just because of its extension.
"""

import os

from django.core.exceptions import ValidationError

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}
VIDEO_EXTENSIONS = {".mp4", ".mov"}

IMAGE_MIME_TYPES = {"image/jpeg", "image/png"}
VIDEO_MIME_TYPES = {"video/mp4", "video/quicktime"}

MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024  # 8 MB
MAX_VIDEO_SIZE_BYTES = 250 * 1024 * 1024  # 250 MB


def _sniff_mime_type(uploaded_file):
    try:
        import magic  # python-magic-bin on Windows, python-magic elsewhere
    except ImportError:
        return None

    uploaded_file.seek(0)
    header = uploaded_file.read(2048)
    uploaded_file.seek(0)
    try:
        return magic.from_buffer(header, mime=True)
    except Exception:
        return None


def validate_media_file(uploaded_file, content_type):
    """
    content_type: "POST" (image) or "REEL" (video).
    Raises django.core.exceptions.ValidationError with a useful message.
    """
    ext = os.path.splitext(uploaded_file.name)[1].lower()

    if content_type == "POST":
        allowed_ext, allowed_mime, max_size, label = (
            IMAGE_EXTENSIONS, IMAGE_MIME_TYPES, MAX_IMAGE_SIZE_BYTES, "image",
        )
    elif content_type == "REEL":
        allowed_ext, allowed_mime, max_size, label = (
            VIDEO_EXTENSIONS, VIDEO_MIME_TYPES, MAX_VIDEO_SIZE_BYTES, "video",
        )
    else:
        raise ValidationError(f"Unknown content_type '{content_type}'.")

    if ext not in allowed_ext:
        raise ValidationError(
            f"Unsupported file extension '{ext}' for a {label}. Allowed: {', '.join(sorted(allowed_ext))}."
        )

    if uploaded_file.size > max_size:
        raise ValidationError(
            f"File is too large ({uploaded_file.size / (1024 * 1024):.1f} MB). "
            f"Maximum for a {label} is {max_size / (1024 * 1024):.0f} MB."
        )

    declared = getattr(uploaded_file, "content_type", None)
    if declared and declared not in allowed_mime:
        raise ValidationError(f"Unsupported content type '{declared}' for a {label}.")

    sniffed = _sniff_mime_type(uploaded_file)
    if sniffed and sniffed not in allowed_mime:
        raise ValidationError(
            f"File contents do not match a {label} (detected '{sniffed}'). "
            "The file may be corrupted or mislabeled."
        )
