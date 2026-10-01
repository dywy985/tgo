import base64
import asyncio
import io
from uuid import uuid4

import pytest
from PIL import Image
from types import SimpleNamespace

from app.models import TicketAttachment
from app.models.reply_monitor import ReplyMonitorEvent, ReplyMonitorMedia
from app.schemas.reply_monitor import (
    ReplyMonitorEventCreate,
    ReplyMonitorEventResult,
    ReplyMonitorMediaResponse,
    ReplyMonitorTimelineEvent,
)
from app.services.reply_monitor_media_service import (
    link_batch_media_to_ticket,
    sanitize_image,
    store_reply_monitor_media,
)


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def test_monitor_event_contract_supports_unknown_hint_and_effective_identity():
    event = ReplyMonitorEventCreate(
        message_id="message-unknown",
        conversation_key="group-1",
        conversation_type="group",
        sender_kind="unknown",
        sender_name="新成员",
        occurred_at="2026-09-04T00:00:00+08:00",
    )
    result = ReplyMonitorEventResult(
        effective_sender_kind="unknown", effective_sender_name="新成员"
    )

    assert event.sender_kind == "unknown"
    assert result.effective_sender_kind == "unknown"
    assert result.effective_sender_name == "新成员"


def test_sanitize_image_reencodes_valid_png():
    image = sanitize_image(PNG_1X1, "image/png", "客户截图.png")

    assert image.content_type == "image/png"
    assert image.width == 1
    assert image.height == 1
    assert image.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert image.sha256
    assert image.filename.endswith(".png")


def test_screen_preview_crop_removes_black_bars_without_changing_cache_images():
    source = Image.new("RGB", (720, 1600), "black")
    source.paste("white", (0, 500, 720, 1100))
    source.paste("white", (250, 1450, 470, 1490))  # Preview button below image.
    data = io.BytesIO()
    source.save(data, format="PNG")

    cropped = sanitize_image(
        data.getvalue(), "image/png", "preview.png", crop_screen_preview=True
    )
    unchanged = sanitize_image(data.getvalue(), "image/png", "preview.png")

    assert (cropped.width, cropped.height) == (720, 600)
    assert (unchanged.width, unchanged.height) == (720, 1600)


def test_sanitize_image_rejects_claimed_mime_mismatch():
    with pytest.raises(ValueError, match="文件类型不匹配"):
        sanitize_image(PNG_1X1, "image/jpeg", "伪装.jpg")


def test_sanitize_image_rejects_oversized_payload_without_decoding():
    with pytest.raises(ValueError, match="8 MB"):
        sanitize_image(b"x" * (8 * 1024 * 1024 + 1), "image/png", "too-big.png")


def test_gif_is_flattened_to_static_png_and_metadata_is_removed():
    source = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(
        source, format="GIF", comment=b"private-location"
    )

    result = sanitize_image(source.getvalue(), "image/gif", "customer.gif")

    assert result.content_type == "image/png"
    assert result.filename == "customer.png"
    assert b"private-location" not in result.content
    with Image.open(io.BytesIO(result.content)) as normalized:
        assert normalized.format == "PNG"
        assert getattr(normalized, "n_frames", 1) == 1


def test_monitor_timeline_exposes_private_media_metadata():
    media_id = uuid4()
    payload = ReplyMonitorTimelineEvent(
        id=uuid4(),
        message_id="message-1",
        sender_kind="customer",
        message_type="image",
        occurred_at="2026-09-03T01:00:00Z",
        media=[
            ReplyMonitorMediaResponse(
                id=media_id,
                content_type="image/png",
                file_size=68,
                width=1,
                height=1,
                status="ready",
                url=f"/v1/reply-monitor/media/{media_id}",
            )
        ],
    )

    assert payload.media[0].url.endswith(str(media_id))
    assert ReplyMonitorMedia.__tablename__ == "api_reply_monitor_media"


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def first(self):
        return self.rows[0] if self.rows else None

    def all(self):
        return list(self.rows)


class _MediaDb:
    def __init__(self, event):
        self.event = event
        self.media = []
        self.attachments = []
        self.commits = 0

    def query(self, model):
        if model is ReplyMonitorEvent:
            return _Query([self.event])
        if model is ReplyMonitorMedia:
            return _Query(self.media)
        return _Query([])

    def add(self, row):
        if isinstance(row, ReplyMonitorMedia) and row not in self.media:
            self.media.append(row)
        if isinstance(row, TicketAttachment):
            self.attachments.append(row)

    def flush(self):
        for row in [*self.media, *self.attachments]:
            if row.id is None:
                row.id = uuid4()

    def commit(self):
        self.commits += 1

    def refresh(self, row):
        return None

    def rollback(self):
        return None


class _Storage:
    def __init__(self):
        self.uploads = []

    async def upload(self, file, path, content_type):
        self.uploads.append((path, content_type, file.read()))
        return path

    async def delete(self, path):
        return True


def test_media_store_is_idempotent_and_later_links_to_one_ticket_attachment():
    project_id, platform_id, batch_id = uuid4(), uuid4(), uuid4()
    event = SimpleNamespace(
        id=uuid4(), project_id=project_id, platform_id=platform_id, batch_id=batch_id
    )
    platform = SimpleNamespace(id=platform_id, project_id=project_id)
    db, storage = _MediaDb(event), _Storage()

    media, duplicate = asyncio.run(
        store_reply_monitor_media(
            db, platform, "message-1", PNG_1X1, "image/png", "现场截图.png",
            "screen_crop",
            storage=storage,
        )
    )
    same, duplicate_again = asyncio.run(
        store_reply_monitor_media(
            db, platform, "message-1", PNG_1X1, "image/png", "现场截图.png",
            storage=storage,
        )
    )

    assert duplicate is False and duplicate_again is True
    assert same is media
    assert media.capture_source == "screen_crop"
    assert len(storage.uploads) == 1

    ticket = SimpleNamespace(id=uuid4(), project_id=project_id)
    assert link_batch_media_to_ticket(db, batch_id, ticket) == 1
    assert link_batch_media_to_ticket(db, batch_id, ticket) == 0
    assert len(db.attachments) == 1
    assert media.ticket_attachment_id == db.attachments[0].id


@pytest.mark.parametrize("source", ["recovered_cache", "recovered_screen_crop"])
def test_media_store_accepts_confirmed_recovery_capture_sources(source):
    project_id, platform_id = uuid4(), uuid4()
    event = SimpleNamespace(
        id=uuid4(), project_id=project_id, platform_id=platform_id, batch_id=None
    )
    platform = SimpleNamespace(id=platform_id, project_id=project_id)
    db, storage = _MediaDb(event), _Storage()

    media, duplicate = asyncio.run(
        store_reply_monitor_media(
            db, platform, "message-recovered", PNG_1X1, "image/png", "恢复.png",
            source, storage=storage,
        )
    )

    assert duplicate is False
    assert media.capture_source == source
