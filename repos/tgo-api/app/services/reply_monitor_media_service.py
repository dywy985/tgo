"""Validation and privacy-safe normalization for reply-monitor images."""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from uuid import uuid4

from PIL import Image, ImageFile, UnidentifiedImageError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Ticket, TicketAttachment
from app.models.reply_monitor import ReplyMonitorEvent, ReplyMonitorMedia
from app.services.storage import get_storage
from app.services.storage.base import StorageBackend


MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
    "GIF": "image/gif",
}
_MIME_TO_EXTENSION = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
ImageFile.LOAD_TRUNCATED_IMAGES = False


@dataclass(frozen=True)
class SanitizedImage:
    content: bytes
    content_type: str
    filename: str
    width: int
    height: int
    sha256: str


def _safe_stem(filename: str) -> str:
    stem = Path((filename or "image").replace("\\", "_").replace("/", "_")).stem
    return (stem.replace("..", ".") or "image")[:200]


def _crop_dark_preview_bars(source: Image.Image) -> Image.Image:
    """Remove black WeCom preview bars from a phone screen capture."""
    width, height = source.size
    if width < 200 or height < 400:
        return source
    rgb = source.convert("RGB")
    if max(rgb.getpixel((0, 0))) > 30:
        return source
    step = max(1, width // 80)
    xs = range(0, width, step)

    def is_image_row(y: int) -> bool:
        return sum(max(rgb.getpixel((x, y))) > 40 for x in xs) * 5 >= len(xs) * 3

    middle = height // 2
    if not is_image_row(middle):
        return source
    top = middle
    bottom = middle
    while top > 0 and is_image_row(top - 1):
        top -= 1
    while bottom < height - 1 and is_image_row(bottom + 1):
        bottom += 1
    if bottom - top + 1 < height // 10 or top + height - bottom - 1 < height // 8:
        return source
    return source.crop((0, top, width, bottom + 1))


def sanitize_image(
    content: bytes, claimed_type: str, filename: str, *, crop_screen_preview: bool = False
) -> SanitizedImage:
    """Decode and re-encode an image, stripping metadata and active payloads."""
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise ValueError("图片大小必须在 1 字节到 8 MB 之间")
    if claimed_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("不支持的图片类型")
    try:
        with Image.open(io.BytesIO(content)) as source:
            detected_type = _FORMAT_TO_MIME.get((source.format or "").upper())
            if not detected_type or detected_type != claimed_type:
                raise ValueError("图片内容与文件类型不匹配")
            source.load()
            if crop_screen_preview:
                source = _crop_dark_preview_bars(source)
            width, height = source.size
            if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                raise ValueError("图片像素超过 2500 万限制")

            # Animated GIFs become a safe static PNG. Other formats retain their
            # visual content while metadata (including EXIF/GPS) is discarded.
            output_type = "image/png" if detected_type in {"image/png", "image/gif"} else detected_type
            output = io.BytesIO()
            if output_type == "image/jpeg":
                normalized = source.convert("RGB")
                normalized.save(output, format="JPEG", quality=90, optimize=True)
            elif output_type == "image/webp":
                normalized = source.convert("RGB")
                normalized.save(output, format="WEBP", quality=90, method=4)
            else:
                normalized = source.convert("RGBA") if "A" in source.getbands() else source.convert("RGB")
                normalized.save(output, format="PNG", optimize=True)
    except ValueError:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("图片文件损坏或不安全") from exc

    sanitized = output.getvalue()
    extension = _MIME_TO_EXTENSION[output_type]
    safe_name = _safe_stem(filename) + extension
    return SanitizedImage(
        content=sanitized,
        content_type=output_type,
        filename=safe_name,
        width=width,
        height=height,
        sha256=hashlib.sha256(sanitized).hexdigest(),
    )


def link_batch_media_to_ticket(
    db: Session, batch_id, ticket: Ticket, *, project_id=None
) -> int:
    """Link ready batch media to a ticket without duplicating stored bytes."""
    owned_project_id = project_id or ticket.project_id
    rows = (
        db.query(ReplyMonitorMedia)
        .filter(
            ReplyMonitorMedia.batch_id == batch_id,
            ReplyMonitorMedia.project_id == owned_project_id,
            ReplyMonitorMedia.status == "ready",
            ReplyMonitorMedia.ticket_attachment_id.is_(None),
        )
        .order_by(ReplyMonitorMedia.created_at.asc())
        .all()
    )
    linked = 0
    for media in rows:
        if media.ticket_attachment_id:
            continue
        attachment = TicketAttachment(
            project_id=media.project_id,
            ticket_id=ticket.id,
            original_name=media.original_name,
            storage_path=media.storage_path,
            content_type=media.content_type,
            file_size=media.file_size,
            sha256=media.sha256,
        )
        db.add(attachment)
        db.flush()
        media.ticket_attachment_id = attachment.id
        linked += 1
    return linked


async def store_reply_monitor_media(
    db: Session,
    platform,
    message_id: str,
    content: bytes,
    content_type: str,
    filename: str,
    capture_source: str = "cache",
    *,
    storage: Optional[StorageBackend] = None,
) -> tuple[ReplyMonitorMedia, bool]:
    """Validate, store and idempotently associate one WorkTool image."""
    allowed_capture_sources = {
        "cache",
        "screen_crop",
        "recovered_cache",
        "recovered_screen_crop",
    }
    if capture_source not in allowed_capture_sources:
        raise ValueError("capture_source 不是受支持的图片来源")
    event = (
        db.query(ReplyMonitorEvent)
        .filter(
            ReplyMonitorEvent.platform_id == platform.id,
            ReplyMonitorEvent.project_id == platform.project_id,
            ReplyMonitorEvent.message_id == message_id,
        )
        .first()
    )
    if event is None:
        raise LookupError("Reply-monitor event not found")

    image = sanitize_image(
        content, content_type, filename,
        crop_screen_preview=capture_source in {"screen_crop", "recovered_screen_crop"},
    )
    existing = (
        db.query(ReplyMonitorMedia)
        .filter(
            ReplyMonitorMedia.platform_id == platform.id,
            ReplyMonitorMedia.message_id == message_id,
            ReplyMonitorMedia.sha256 == image.sha256,
        )
        .first()
    )
    if existing is not None:
        return existing, True

    storage = storage or get_storage()
    storage_path = (
        f"reply-monitor/{platform.project_id}/{event.id}/"
        f"{uuid4().hex}-{image.filename}"
    )
    await storage.upload(io.BytesIO(image.content), storage_path, image.content_type)
    try:
        media = ReplyMonitorMedia(
            project_id=platform.project_id,
            platform_id=platform.id,
            event_id=event.id,
            batch_id=event.batch_id,
            message_id=message_id,
            original_name=image.filename,
            storage_path=storage_path,
            content_type=image.content_type,
            file_size=len(image.content),
            sha256=image.sha256,
            width=image.width,
            height=image.height,
            status="ready",
            capture_source=capture_source,
            expires_at=datetime.now(timezone.utc) + timedelta(
                days=settings.REPLY_MONITOR_RETENTION_DAYS
            ),
        )
        db.add(media)
        db.flush()
        if event.batch_id:
            from app.models.reply_monitor import ReplyMonitorBatch

            batch = db.query(ReplyMonitorBatch).filter(ReplyMonitorBatch.id == event.batch_id).first()
            if batch is not None and batch.ticket_id:
                ticket = db.get(Ticket, batch.ticket_id)
                if ticket is not None:
                    link_batch_media_to_ticket(db, event.batch_id, ticket)
        db.commit()
        db.refresh(media)
        return media, False
    except IntegrityError:
        # A concurrent retry may win the unique constraint after our initial
        # lookup. Remove only this request's bytes, then return the winner.
        db.rollback()
        await storage.delete(storage_path)
        existing = (
            db.query(ReplyMonitorMedia)
            .filter(
                ReplyMonitorMedia.platform_id == platform.id,
                ReplyMonitorMedia.message_id == message_id,
                ReplyMonitorMedia.sha256 == image.sha256,
            )
            .first()
        )
        if existing is not None:
            return existing, True
        raise
    except Exception:
        db.rollback()
        await storage.delete(storage_path)
        raise
