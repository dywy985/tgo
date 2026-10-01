"""Daily retention cleanup for monitor images and customer-identifying text."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.models import Ticket, TicketAttachment
from app.models.reply_monitor import ReplyMonitorBatch, ReplyMonitorEvent, ReplyMonitorMedia
from app.services.reply_monitor_retention_service import redact_event, retention_action_allowed
from app.services.storage import get_storage


logger = get_logger("tasks.reply_monitor_retention")
_task: asyncio.Task | None = None


def _as_aware(value: datetime | None) -> datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


async def run_retention_cleanup(limit: int = 200) -> dict[str, int]:
    db = SessionLocal()
    storage = get_storage()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=settings.REPLY_MONITOR_RETENTION_DAYS)
    deleted = failed = redacted = 0
    try:
        rows = (
            db.query(ReplyMonitorMedia)
            .filter(
                ReplyMonitorMedia.status == "ready",
                ReplyMonitorMedia.expires_at.isnot(None),
                ReplyMonitorMedia.expires_at <= now,
            )
            .order_by(ReplyMonitorMedia.expires_at.asc())
            .limit(limit)
            .all()
        )
        processed_batches = set()

        def redact_batch(batch: ReplyMonitorBatch, ticket: Ticket | None) -> int:
            events = db.query(ReplyMonitorEvent).filter(
                ReplyMonitorEvent.batch_id == batch.id
            ).all()
            count = 0
            for event in events:
                if not (event.event_metadata or {}).get("retention_redacted"):
                    redact_event(event)
                    count += 1
            if ticket:
                ticket.title = "[内容已按数据保留策略脱敏]"
                ticket.description = "[内容已按数据保留策略删除]"
                ticket.contact_name = None
                ticket.contact_phone = None
            processed_batches.add(batch.id)
            return count

        for media in rows:
            try:
                batch = db.get(ReplyMonitorBatch, media.batch_id) if media.batch_id else None
                ticket = db.get(Ticket, batch.ticket_id) if batch and batch.ticket_id else None
                batch_status = batch.status if batch else "replied"
                ticket_status = ticket.status if ticket else None
                terminal_at = (
                    _as_aware(ticket.archived_at or ticket.replied_at or ticket.updated_at)
                    if ticket else _as_aware(batch.updated_at if batch else media.created_at)
                )
                if not retention_action_allowed(batch_status, ticket_status, terminal_at, cutoff):
                    continue
                if media.storage_path:
                    await storage.delete(media.storage_path)
                if media.ticket_attachment_id:
                    attachment = db.get(TicketAttachment, media.ticket_attachment_id)
                    if attachment is not None:
                        db.delete(attachment)
                    media.ticket_attachment_id = None
                media.status = "deleted"
                media.storage_path = ""
                media.original_name = "[deleted]"
                media.file_size = 0
                deleted += 1
                if batch and batch.id not in processed_batches:
                    redacted += redact_batch(batch, ticket)
                db.commit()
            except Exception:
                failed += 1
                db.rollback()
                logger.exception("retention cleanup item failed media=%s", media.id)

        # Text-only conversations must expire as well; media rows are not a
        # prerequisite for privacy cleanup.
        batches = (
            db.query(ReplyMonitorBatch)
            .filter(
                ReplyMonitorBatch.status != "pending",
                ReplyMonitorBatch.updated_at < cutoff,
            )
            .order_by(ReplyMonitorBatch.updated_at.asc())
            .limit(limit)
            .all()
        )
        for batch in batches:
            if batch.id in processed_batches:
                continue
            try:
                ticket = db.get(Ticket, batch.ticket_id) if batch.ticket_id else None
                terminal_at = (
                    _as_aware(ticket.archived_at or ticket.replied_at or ticket.updated_at)
                    if ticket else _as_aware(batch.updated_at)
                )
                if not retention_action_allowed(
                    batch.status,
                    ticket.status if ticket else None,
                    terminal_at,
                    cutoff,
                ):
                    continue
                redacted += redact_batch(batch, ticket)
                db.commit()
            except Exception:
                failed += 1
                db.rollback()
                logger.exception("retention cleanup batch failed batch=%s", batch.id)
        logger.info(
            "retention cleanup completed deleted=%d redacted=%d failed=%d",
            deleted, redacted, failed,
        )
        return {"deleted": deleted, "redacted": redacted, "failed": failed}
    finally:
        db.close()


async def _loop() -> None:
    while True:
        try:
            await run_retention_cleanup()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("reply monitor retention scan failed")
        await asyncio.sleep(24 * 60 * 60)


def start_reply_monitor_retention_task() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())


async def stop_reply_monitor_retention_task() -> None:
    global _task
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
