"""Periodic internal reminders for unanswered customer batches."""

from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

from sqlalchemy import and_, or_

from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.models import Staff, Ticket
from app.models.reply_monitor import (
    ReplyMonitorBatch,
    ReplyMonitorDigest,
    ReplyMonitorEvent,
    ReplyMonitorReminder,
    WeComConversationBinding,
)
from app.core.config import settings as app_settings
from app.services.wecom_conversation_service import issue_jump_grant
from app.services.reply_monitor_service import (
    add_working_minutes,
    get_or_create_settings,
    working_minutes_between,
)
from app.services.reply_monitor_ticket_service import ensure_reply_monitor_ticket

logger = get_logger("tasks.reply_monitor_reminders")
_task: asyncio.Task | None = None
DISPATCH_GRACE = timedelta(minutes=5)


def digest_window_start(value: datetime, minutes: int) -> datetime:
    """Return the stable UTC bucket used by a WeCom digest."""
    value = value.astimezone(timezone.utc)
    minute = value.minute - value.minute % minutes
    return value.replace(minute=minute, second=0, microsecond=0)


def split_digest_items(items: list[Any], maximum: int) -> list[list[Any]]:
    return [items[index:index + maximum] for index in range(0, len(items), maximum)]


def build_wecom_digest_content(
    items: list[Any], recipient_name: str, chunk_index: int, chunk_total: int,
    *, unassigned: bool,
) -> str:
    """Build one transport-neutral, actionable reminder digest."""
    ordered = sorted(
        items,
        key=lambda item: (
            int(item.sequence) >= int(item.max_reminders),
            int(item.pending_working_minutes),
        ),
        reverse=True,
    )
    longest = max((int(item.pending_working_minutes) for item in ordered), default=0)
    final_count = sum(int(item.sequence) >= int(item.max_reminders) for item in ordered)
    kind = "待认领" if unassigned else "未回复"
    page = f"（{chunk_index}/{chunk_total}）" if chunk_total > 1 else ""
    lines = [
        f"【{kind}提醒】{len(ordered)} 个群聊待回复{page}",
        f"接收人：{recipient_name}｜最长等待 {longest} 分钟｜最后提醒 {final_count} 项",
        "",
    ]
    for index, item in enumerate(ordered, 1):
        stage = "最后一次提醒" if int(item.sequence) >= int(item.max_reminders) else (
            "首次提醒" if int(item.sequence) == 1 else f"第 {item.sequence} 次提醒"
        )
        owner = "未分配" if unassigned else item.responsible_staff_name
        summary = str(item.latest_customer_summary or "[无文本摘要]").replace("\n", " ")[:80]
        lines.extend([
            f"{index}. {item.conversation_name or item.conversation_key}｜等待 {item.pending_working_minutes} 分钟｜{stage}",
            f"   {item.customer_message_count} 条消息｜负责人：{owner}｜工单：{item.ticket_number or '待生成'}",
            f"   最近消息：{summary}",
        ])
    lines.extend(["", "请优先处理等待最久及最后提醒项。"])
    return "\n".join(lines)


def digest_idempotency_key(
    project_id: Any, recipient_staff_id: Any, window_start: datetime,
    unassigned: bool, chunk_index: int, delivery_ids: list[Any] | None = None,
) -> str:
    kind = "unassigned" if unassigned else "owner"
    members = ",".join(sorted(str(value) for value in (delivery_ids or [])))
    member_hash = hashlib.sha256(members.encode("utf-8")).hexdigest()[:16]
    return (
        f"reply-monitor-digest:{project_id}:{recipient_staff_id}:"
        f"{window_start.astimezone(timezone.utc).isoformat()}:{kind}:{chunk_index}:{member_hash}"
    )


def _reminder_delivery_enabled(settings) -> bool:
    """Default old/in-memory settings objects to the pre-migration behavior."""
    return bool(getattr(settings, "reminders_enabled", True))


def _batch_due_filter(now: datetime):
    """Select due reminders plus previously-reminded problems missing a ticket."""
    return or_(
        and_(
            ReplyMonitorBatch.next_reminder_at.isnot(None),
            ReplyMonitorBatch.next_reminder_at <= now,
        ),
        and_(
            ReplyMonitorBatch.ticket_id.is_(None),
            ReplyMonitorBatch.is_problem_candidate.is_(True),
            ReplyMonitorBatch.reminder_count > 0,
        ),
    )


async def _send(
    channel: str, staff: Staff, content: str, db, idempotency_key: str = "",
    *, action_url: str | None = None, notification_payload: dict | None = None,
) -> None:
    if channel == "in_app":
        from app.services.wukongim_client import wukongim_client
        await wukongim_client.send_text_message(
            from_uid="reply-monitor-system", channel_id=f"{staff.id}-staff",
            channel_type=1, content=content, client_msg_no=idempotency_key,
            extra=notification_payload,
        )
    elif channel == "wecom_app":
        if action_url:
            from app.services.wecom_app_client import find_wecom_jump_platform, send_wecom_app_textcard
            platform = find_wecom_jump_platform(db, staff.project_id)
            if platform is None or not await send_wecom_app_textcard(
                platform, staff.wecom_userid, "待回复群聊", content, action_url,
            ):
                raise RuntimeError("企微精准跳转卡片发送失败")
        else:
            from app.services.wecom_app_client import send_staff_private_reminder
            await send_staff_private_reminder(
                db, staff, content, idempotency_key=idempotency_key
            )


def _jump_action_for_batch(db, staff: Staff, batch: ReplyMonitorBatch) -> tuple[str | None, str | None]:
    """Create a staff-bound grant without ever placing chatId in the message."""
    if not staff.wecom_userid or not str(app_settings.API_BASE_URL).startswith("https://"):
        return None, None
    binding = db.query(WeComConversationBinding).filter_by(
        project_id=batch.project_id,
        platform_id=batch.platform_id,
        conversation_key=batch.conversation_key,
        status="available",
    ).first()
    if binding is None or not binding.wecom_chat_id:
        return None, None
    token, _grant = issue_jump_grant(db, binding, staff)
    return (
        f"{str(app_settings.API_BASE_URL).rstrip('/')}/v1/reply-monitor/wecom-jump/{token}",
        str(binding.id),
    )


def _digest_item(db, delivery: ReplyMonitorReminder, now: datetime):
    batch = db.get(ReplyMonitorBatch, delivery.batch_id)
    if (
        batch is None or batch.status != "pending"
        or delivery.sequence != batch.reminder_count + 1
    ):
        return None
    cfg = get_or_create_settings(db, batch.project_id)
    latest = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.batch_id == batch.id,
        ReplyMonitorEvent.sender_kind == "customer",
    ).order_by(ReplyMonitorEvent.occurred_at.desc()).first()
    ticket = db.get(Ticket, batch.ticket_id) if batch.ticket_id else None
    owner = db.get(Staff, batch.responsible_staff_id) if batch.responsible_staff_id else None
    return SimpleNamespace(
        delivery=delivery,
        batch=batch,
        sequence=delivery.sequence,
        max_reminders=cfg.max_reminders,
        pending_working_minutes=round(working_minutes_between(batch.first_customer_at, now, cfg)),
        conversation_name=batch.conversation_name,
        conversation_key=batch.conversation_key,
        customer_message_count=batch.customer_message_count,
        latest_customer_summary=latest.content_summary if latest else None,
        responsible_staff_name=(owner.name or owner.nickname or owner.username) if owner else "未分配",
        ticket_number=ticket.number if ticket else None,
    )


def _advance_batch_if_ready(db, batch_id, sequence: int, now: datetime) -> bool:
    batch = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.id == batch_id
    ).with_for_update().one_or_none()
    if batch is None or batch.status != "pending" or batch.reminder_count >= sequence:
        return False
    deliveries = db.query(ReplyMonitorReminder).filter_by(
        batch_id=batch_id, sequence=sequence
    ).all()
    if not deliveries or any(row.status != "sent" for row in deliveries):
        return False
    cfg = get_or_create_settings(db, batch.project_id)
    batch.reminder_count = sequence
    batch.next_reminder_at = (
        add_working_minutes(now, cfg.repeat_reminder_minutes, cfg)
        if sequence < cfg.max_reminders else None
    )
    return True


def _create_closed_wecom_digests(db, now: datetime) -> int:
    candidates = db.query(ReplyMonitorReminder).join(
        ReplyMonitorBatch, ReplyMonitorReminder.batch_id == ReplyMonitorBatch.id
    ).filter(
        ReplyMonitorReminder.channel == "wecom_app",
        ReplyMonitorReminder.digest_id.is_(None),
        ReplyMonitorReminder.status.in_(("pending", "failed")),
        ReplyMonitorBatch.status == "pending",
    ).order_by(ReplyMonitorReminder.created_at.asc()).with_for_update(skip_locked=True).limit(500).all()
    grouped: dict[tuple, list] = {}
    for delivery in candidates:
        batch = db.get(ReplyMonitorBatch, delivery.batch_id)
        cfg = get_or_create_settings(db, batch.project_id)
        created_at = delivery.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        window = digest_window_start(created_at, cfg.wecom_digest_minutes)
        if window + timedelta(minutes=cfg.wecom_digest_minutes) > now:
            continue
        unassigned = batch.responsible_staff_id is None
        grouped.setdefault(
            (batch.project_id, delivery.recipient_staff_id, window, unassigned), []
        ).append(delivery)

    created = 0
    for (project_id, recipient_id, window, unassigned), deliveries in grouped.items():
        if recipient_id is None:
            continue
        cfg = get_or_create_settings(db, project_id)
        valid_items = [item for row in deliveries if (item := _digest_item(db, row, now))]
        valid_ids = {item.delivery.id for item in valid_items}
        for row in deliveries:
            if row.id not in valid_ids:
                row.status = "cancelled"
        ordered = sorted(
            valid_items,
            key=lambda item: (
                int(item.sequence) >= int(item.max_reminders),
                int(item.pending_working_minutes),
                str(item.batch.id),
            ),
            reverse=True,
        )
        # One card maps to exactly one hidden chatId. Keep the configured closed
        # aggregation window, but never merge different groups into one action.
        chunks = [[item] for item in ordered]
        staff = db.get(Staff, recipient_id)
        if staff is None:
            continue
        recipient_name = staff.name or staff.nickname or staff.username
        for index, chunk in enumerate(chunks, 1):
            key = digest_idempotency_key(
                project_id, recipient_id, window, unassigned, index,
                [item.delivery.id for item in chunk],
            )
            existing = db.query(ReplyMonitorDigest).filter_by(idempotency_key=key).first()
            if existing:
                for item in chunk:
                    if item.delivery.digest_id is None:
                        item.delivery.digest_id = existing.id
                continue
            digest = ReplyMonitorDigest(
                project_id=project_id,
                recipient_staff_id=recipient_id,
                window_start=window,
                chunk_index=index,
                unassigned=unassigned,
                idempotency_key=key,
                content_snapshot=build_wecom_digest_content(
                    chunk, recipient_name, index, len(chunks), unassigned=unassigned
                ),
            )
            db.add(digest)
            db.flush()
            for item in chunk:
                item.delivery.digest_id = digest.id
            created += 1
    db.commit()
    return created


async def run_wecom_digest_scan() -> int:
    """Persist, claim and send closed WeCom digest windows."""
    db = SessionLocal()
    sent = 0
    try:
        now = datetime.now(timezone.utc)
        _create_closed_wecom_digests(db, now)
        for _ in range(100):
            digest = db.query(ReplyMonitorDigest).filter(
                ReplyMonitorDigest.status.in_(("pending", "failed", "dispatching"))
            ).order_by(ReplyMonitorDigest.window_start.asc(), ReplyMonitorDigest.chunk_index.asc()).with_for_update(skip_locked=True).first()
            if digest is None:
                break
            if (
                digest.status == "dispatching" and digest.sent_at
                and digest.sent_at > now - DISPATCH_GRACE
            ):
                db.commit()
                break
            deliveries = db.query(ReplyMonitorReminder).filter_by(digest_id=digest.id).all()
            items = []
            for delivery in deliveries:
                item = _digest_item(db, delivery, now)
                if item:
                    items.append(item)
                else:
                    delivery.status = "cancelled"
            if not items:
                digest.status = "cancelled"
                db.commit()
                continue
            staff = db.get(Staff, digest.recipient_staff_id)
            if staff is None or staff.deleted_at is not None or staff.role == "agent":
                digest.status = "failed"
                digest.error_message = "recipient is not an active human staff member"
                db.commit()
                continue
            chunk_total = db.query(ReplyMonitorDigest).filter_by(
                project_id=digest.project_id,
                recipient_staff_id=digest.recipient_staff_id,
                window_start=digest.window_start,
                unassigned=digest.unassigned,
            ).count()
            digest.content_snapshot = build_wecom_digest_content(
                items, staff.name or staff.nickname or staff.username,
                digest.chunk_index, chunk_total, unassigned=digest.unassigned,
            )
            digest.status = "dispatching"
            digest.attempts += 1
            digest.sent_at = now
            digest.error_message = None
            digest_id = digest.id
            content = digest.content_snapshot
            key = digest.idempotency_key
            db.commit()
            try:
                action_url, _binding_id = _jump_action_for_batch(db, staff, items[0].batch)
                db.commit()
                await _send("wecom_app", staff, content, db, key, action_url=action_url)
                digest = db.get(ReplyMonitorDigest, digest_id)
                digest.status = "sent"
                digest.error_message = None
                for delivery in db.query(ReplyMonitorReminder).filter_by(digest_id=digest_id).all():
                    if delivery.status != "cancelled":
                        delivery.status = "sent"
                        delivery.sent_at = now
                        delivery.error_message = None
                for batch_id, sequence in {(item.batch.id, item.sequence) for item in items}:
                    _advance_batch_if_ready(db, batch_id, sequence, now)
                sent += 1
            except Exception as exc:
                digest = db.get(ReplyMonitorDigest, digest_id)
                digest.status = "failed"
                digest.error_message = str(exc)[:1000]
                for delivery in db.query(ReplyMonitorReminder).filter_by(digest_id=digest_id).all():
                    if delivery.status != "cancelled":
                        delivery.status = "failed"
                        delivery.error_message = str(exc)[:1000]
                logger.warning("reply monitor digest failed: %s", exc)
            db.commit()
        return sent
    finally:
        db.close()


async def run_reminder_scan() -> int:
    db = SessionLocal()
    processed = 0
    try:
        for _ in range(100):
            now = datetime.now(timezone.utc)
            batch = db.query(ReplyMonitorBatch).filter(
                ReplyMonitorBatch.status == "pending",
                _batch_due_filter(now),
            ).order_by(ReplyMonitorBatch.next_reminder_at.asc()).with_for_update(skip_locked=True).first()
            if batch is None:
                break
            batch_id = batch.id
            cfg = get_or_create_settings(db, batch.project_id)
            if not cfg.enabled:
                # Keep the batch schedulable. Clearing this timestamp used to
                # strand unanswered batches permanently after monitoring was
                # re-enabled.
                batch.next_reminder_at = now + timedelta(minutes=1)
                db.commit()
                continue
            ticket = None
            if batch.ticket_id is None:
                try:
                    ticket, _ = ensure_reply_monitor_ticket(db, batch, cfg.timezone)
                    if ticket is None:
                        batch.next_reminder_at = None
                        db.commit()
                        continue
                    # Ticket creation commits independently. Re-lock and re-check
                    # the batch before delivering a reminder in a multi-worker run.
                    batch = db.query(ReplyMonitorBatch).filter(
                        ReplyMonitorBatch.id == batch_id
                    ).with_for_update().one()
                    now = datetime.now(timezone.utc)
                    if (
                        batch.status != "pending"
                        or batch.next_reminder_at is None
                        or batch.next_reminder_at > now
                    ):
                        db.commit()
                        continue
                except Exception:
                    db.rollback()
                    batch = db.get(ReplyMonitorBatch, batch_id)
                    if batch is not None and batch.status == "pending":
                        batch.next_reminder_at = now + timedelta(minutes=1)
                        db.commit()
                    logger.exception("reply monitor ticket creation failed")
                    continue
            elif batch.ticket_id:
                from app.models import Ticket

                ticket = db.get(Ticket, batch.ticket_id)
            if not _reminder_delivery_enabled(cfg):
                # Monitoring and automatic ticket creation stay active while
                # outbound reminders are paused. Keep this batch due so that
                # re-enabling reminders resumes delivery without losing it.
                batch.next_reminder_at = now + timedelta(minutes=1)
                db.commit()
                continue
            if batch.reminder_count >= cfg.max_reminders:
                batch.next_reminder_at = None
                db.commit()
                continue
            recipients = []
            if batch.responsible_staff_id:
                staff = db.get(Staff, batch.responsible_staff_id)
                if staff: recipients = [staff]
            else:
                recipients = db.query(Staff).filter(Staff.project_id == batch.project_id, Staff.role == "admin", Staff.deleted_at.is_(None)).all()
            sequence = batch.reminder_count + 1
            content = (f"【未回复消息提醒 {sequence}/{cfg.max_reminders}】\n"
                       f"会话：{batch.conversation_name or batch.conversation_key}\n"
                       f"客户消息：{batch.customer_message_count} 条\n"
                       f"工单：{ticket.number if ticket else '已创建'}\n请尽快回复。")
            all_deliveries_sent = bool(recipients)
            for channel, enabled in (cfg.notification_channels or {}).items():
                if not enabled: continue
                for staff in recipients:
                    delivery = db.query(ReplyMonitorReminder).filter_by(batch_id=batch.id, sequence=sequence, channel=channel, recipient_staff_id=staff.id).first()
                    if not delivery:
                        delivery = ReplyMonitorReminder(batch_id=batch.id, sequence=sequence, channel=channel, recipient_staff_id=staff.id)
                        db.add(delivery); db.flush()
                    if delivery.status == "sent": continue
                    if channel == "wecom_app":
                        # WeCom deliveries are persisted now and dispatched after
                        # their configured aggregate window closes.
                        all_deliveries_sent = False
                        continue
                    if delivery.status == "dispatching":
                        # The external API cannot provide a transactional commit.
                        # A recent durable claim means another worker owns it. If
                        # it survives a restart, prefer at-most-once delivery and
                        # eventually treat the ambiguous attempt as dispatched.
                        if delivery.sent_at and delivery.sent_at > now - DISPATCH_GRACE:
                            all_deliveries_sent = False
                            continue
                        delivery.status = "failed"
                        delivery.error_message = "stale dispatch claim; retrying with the same idempotency key"
                    delivery.status = "dispatching"
                    delivery.attempts += 1
                    delivery.sent_at = now
                    delivery.error_message = None
                    delivery_id = delivery.id
                    db.commit()
                    try:
                        action_url, binding_id = _jump_action_for_batch(db, staff, batch)
                        notification_payload = {
                            "kind": "reply_monitor_reminder",
                            "ticket_id": str(batch.ticket_id) if batch.ticket_id else None,
                            "batch_id": str(batch.id),
                            "conversation_binding_id": binding_id,
                            "wecom_action": "available" if binding_id else "unsupported",
                        }
                        db.commit()
                        await _send(
                            channel, staff, content, db,
                            f"reply-monitor:{batch_id}:{sequence}:{channel}:{staff.id}",
                            action_url=action_url,
                            notification_payload=notification_payload,
                        )
                        delivery = db.get(ReplyMonitorReminder, delivery_id)
                        delivery.status = "sent"; delivery.error_message = None
                    except Exception as exc:
                        delivery = db.get(ReplyMonitorReminder, delivery_id)
                        delivery.status = "failed"; delivery.error_message = str(exc)[:1000]
                        all_deliveries_sent = False
                        logger.warning("reply monitor notification failed: %s", exc)
                    db.commit()
            # Claims commit independently, so reacquire the batch before
            # advancing its reminder sequence.
            batch = db.query(ReplyMonitorBatch).filter(
                ReplyMonitorBatch.id == batch_id
            ).with_for_update().one()
            if batch.status != "pending" or batch.reminder_count >= sequence:
                db.commit()
                continue
            if all_deliveries_sent:
                batch.reminder_count = sequence
                batch.next_reminder_at = (add_working_minutes(now, cfg.repeat_reminder_minutes, cfg)
                                          if sequence < cfg.max_reminders else None)
            else:
                # Successful per-recipient deliveries remain idempotently recorded;
                # retry only failed/missing deliveries on the next scan.
                batch.next_reminder_at = now + timedelta(minutes=1)
            processed += 1
            db.commit()
        await run_wecom_digest_scan()
        return processed
    finally:
        db.close()


async def _loop() -> None:
    while True:
        try:
            await run_reminder_scan()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("reply monitor scan failed")
        await asyncio.sleep(60)


def start_reply_monitor_task() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())


async def stop_reply_monitor_task() -> None:
    global _task
    if _task:
        _task.cancel()
        try: await _task
        except asyncio.CancelledError: pass
        _task = None
