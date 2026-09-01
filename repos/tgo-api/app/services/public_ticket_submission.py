from __future__ import annotations

import re
from typing import Dict


MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_PHONE_RE = re.compile(r"^[0-9+()\-\s]{7,32}$")


def detect_image_type(content: bytes):
    """Return the MIME type from trusted file signature bytes."""
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


def normalize_public_ticket_fields(
    *, title: str, description: str, contact_name: str, contact_phone: str
) -> Dict[str, str]:
    values = {
        "title": (title or "").strip(),
        "description": (description or "").strip(),
        "contact_name": (contact_name or "").strip(),
        "contact_phone": (contact_phone or "").strip(),
    }
    if not values["title"] or len(values["title"]) > 120:
        raise ValueError("title must contain 1-120 characters")
    if not values["description"] or len(values["description"]) > 20_000:
        raise ValueError("description must contain 1-20000 characters")
    if not values["contact_name"] or len(values["contact_name"]) > 100:
        raise ValueError("contact name must contain 1-100 characters")
    phone = values["contact_phone"]
    if not _PHONE_RE.fullmatch(phone) or sum(char.isdigit() for char in phone) < 7:
        raise ValueError("contact phone is invalid")
    return values


def validate_ticket_image(filename: str, content_type: str, size: int) -> str:
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("unsupported image type")
    if size <= 0 or size > MAX_IMAGE_BYTES:
        raise ValueError("image must be between 1 byte and 8 MB")
    safe_name = (filename or "image").replace("\\", "_").replace("/", "_").replace("..", ".")
    return safe_name[:255]
