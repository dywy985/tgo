"""Ticket lifecycle owned by the human reply monitor."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Sequence
from zoneinfo import ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models import Staff, Ticket, TicketStatusHistory, Visitor
from app.models.reply_monitor import (
    ReplyMonitorBatch,
    ReplyMonitorEvent,
    ReplyMonitorMedia,
    ReplyMonitorMediaRecoveryCandidate,
    WeComConversationBinding,
)
from app.schemas.reply_monitor import (
    ReplyMonitorBatchContext,
    ReplyMonitorMediaResponse,
    ReplyMonitorTicketContext,
    ReplyMonitorTimelineEvent,
)
from app.services.reply_monitor_service import resolve_timezone
from app.services.reply_monitor_media_service import link_batch_media_to_ticket
from app.services.ticket_service import create_ticket


def build_monitor_ticket_title(
    batch: ReplyMonitorBatch, events: Sequence[ReplyMonitorEvent]
) -> str:
    for event in events:
        summary = str(event.content_summary or "").strip()
        if (
            summary
            and str(getattr(event, "message_type", "text") or "text").lower() != "image"
            and summary not in {"[图片]", "【图片】", "[image]"}
        ):
            return summary[:120]
    return f"{batch.conversation_name or batch.conversation_key} 客户问题待回复"[:120]


def build_monitor_ticket_description(
    batch: ReplyMonitorBatch,
    events: Sequence[ReplyMonitorEvent],
    timezone_name: str,
) -> str:
    try:
        tz = resolve_timezone(timezone_name)
    except ZoneInfoNotFoundError:
        tz = timezone.utc
    lines = [f"会话：{batch.conversation_name or batch.conversation_key}", "问题与回复时间线："]
    for event in events:
        when = event.occurred_at
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        local_time = when.astimezone(tz).strftime("%Y-%m-%d %H:%M:%S")
        sender = event.sender_name or event.sender_id or "客户"
        summary = str(event.content_summary or "").strip() or "（无可提取正文）"
        role = "客服回复" if event.sender_kind == "staff" else "客户问题"
        lines.append(f"- {local_time} {role} · {sender} [{event.message_type}] {summary}")
    return "\n".join(lines)


def is_monitor_ticket_candidate(batch: ReplyMonitorBatch) -> bool:
    return bool(getattr(batch, "is_problem_candidate", False))


def ensure_reply_monitor_ticket(
    db: Session,
    batch: ReplyMonitorBatch,
    timezone_name: str,
    *,
    include_staff_events: bool = False,
    commit: bool = True,
    creation_note: str = "人工回复监控首次提醒超时自动建单",
) -> tuple[Optional[Ticket], bool]:
    """Idempotently create one pending-human ticket for a locked batch."""
    if batch.ticket_id:
        ticket = db.get(Ticket, batch.ticket_id)
        if ticket is not None:
            return ticket, False

    if not is_monitor_ticket_candidate(batch):
        return None, False
    event_query = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.batch_id == batch.id,
    )
    if not include_staff_events:
        event_query = event_query.filter(ReplyMonitorEvent.sender_kind == "customer")
    events = (
        event_query
        .order_by(ReplyMonitorEvent.occurred_at.asc())
        .all()
    )
    visitor = None
    if batch.channel_open_id:
        visitor = (
            db.query(Visitor)
            .filter(
                Visitor.project_id == batch.project_id,
                Visitor.platform_id == batch.platform_id,
                Visitor.platform_open_id == batch.channel_open_id,
                Visitor.deleted_at.is_(None),
            )
            .first()
        )
    ticket = create_ticket(
        db,
        project_id=batch.project_id,
        title=build_monitor_ticket_title(batch, events),
        description=build_monitor_ticket_description(batch, events, timezone_name),
        category="其他",
        priority="normal",
        source="reply_monitor",
        status="pending_reply",
        visitor_id=visitor.id if visitor else None,
        platform_id=batch.platform_id,
        group_key=batch.conversation_key,
        assignee_id=batch.responsible_staff_id,
        custom_fields={
            "reply_monitor_batch_id": str(batch.id),
            "reply_monitor_ticket_mode": (
                "answered_recognition_test" if include_staff_events else "timeout"
            ),
        },
        commit=False,
    )
    db.flush()
    batch.ticket_id = ticket.id
    link_batch_media_to_ticket(db, batch.id, ticket, project_id=batch.project_id)
    db.add(
        TicketStatusHistory(
            project_id=batch.project_id,
            ticket_id=ticket.id,
            from_status=None,
            to_status="pending_reply",
            operator_type="system",
            note=creation_note,
        )
    )
    if commit:
        db.commit()
        db.refresh(ticket)
        db.refresh(batch)
    return ticket, True


def ensure_answered_reply_monitor_ticket(
    db: Session,
    batch: ReplyMonitorBatch,
    staff: Optional[Staff],
    replied_at: datetime,
    timezone_name: str,
) -> tuple[Optional[Ticket], bool]:
    """Create/update one atomic recognition-test ticket for an answered batch."""
    ticket, created = ensure_reply_monitor_ticket(
        db,
        batch,
        timezone_name,
        include_staff_events=True,
        commit=False,
        creation_note="客服回复触发识别测试工单",
    )
    if ticket is None:
        return None, False
    transition_monitor_ticket_to_replied(db, batch, staff, replied_at)
    events = (
        db.query(ReplyMonitorEvent)
        .filter(ReplyMonitorEvent.batch_id == batch.id)
        .order_by(ReplyMonitorEvent.occurred_at.asc())
        .all()
    )
    ticket.description = build_monitor_ticket_description(batch, events, timezone_name)
    return ticket, created


def transition_monitor_ticket_to_replied(
    db: Session,
    batch: ReplyMonitorBatch,
    staff: Optional[Staff],
    replied_at: datetime,
) -> bool:
    if not batch.ticket_id:
        return False
    ticket = db.get(Ticket, batch.ticket_id)
    if ticket is None or ticket.status != "pending_reply":
        return False
    from_status = ticket.status
    naive_reply = replied_at.astimezone(timezone.utc).replace(tzinfo=None) if replied_at.tzinfo else replied_at
    ticket.status = "replied"
    ticket.first_response_at = ticket.first_response_at or naive_reply
    ticket.replied_at = naive_reply
    db.add(
        TicketStatusHistory(
            project_id=ticket.project_id,
            ticket_id=ticket.id,
            from_status=from_status,
            to_status="replied",
            operator_id=staff.id if staff else None,
            operator_type="staff",
            note="客服首次回复，工单自动标记为已回复",
        )
    )
    ticket.status = "archived"
    ticket.archived_at = naive_reply
    ticket.updated_at = naive_reply
    db.add(
        TicketStatusHistory(
            project_id=ticket.project_id,
            ticket_id=ticket.id,
            from_status="replied",
            to_status="archived",
            operator_id=staff.id if staff else None,
            operator_type="staff",
            note="客服首次回复，监控工单自动归档",
        )
    )
    return True


def get_reply_monitor_ticket_context(
    db: Session, project_id, ticket: Ticket, current_staff: Optional[Staff] = None
) -> ReplyMonitorTicketContext | None:
    batch = (
        db.query(ReplyMonitorBatch)
        .filter(
            ReplyMonitorBatch.project_id == project_id,
            ReplyMonitorBatch.ticket_id == ticket.id,
        )
        .first()
    )
    if batch is None:
        return None
    events = (
        db.query(ReplyMonitorEvent)
        .filter(ReplyMonitorEvent.batch_id == batch.id)
        .order_by(ReplyMonitorEvent.occurred_at.asc())
        .all()
    )
    media_rows = (
        db.query(ReplyMonitorMedia)
        .filter(
            ReplyMonitorMedia.batch_id == batch.id,
            ReplyMonitorMedia.project_id == project_id,
        )
        .order_by(ReplyMonitorMedia.created_at.asc())
        .all()
    )
    media_by_event: dict = {}
    for media in media_rows:
        media_by_event.setdefault(media.event_id, []).append(
            ReplyMonitorMediaResponse(
                id=media.id,
                content_type=media.content_type,
                file_size=media.file_size,
                width=media.width,
                height=media.height,
                status=media.status,
                url=f"/v1/reply-monitor/media/{media.id}",
                capture_source=getattr(media, "capture_source", "cache"),
            )
        )
    candidate_rows = db.query(ReplyMonitorMediaRecoveryCandidate).filter(
        ReplyMonitorMediaRecoveryCandidate.project_id == project_id,
        ReplyMonitorMediaRecoveryCandidate.event_id.in_([event.id for event in events]),
        ReplyMonitorMediaRecoveryCandidate.status == "pending",
    ).all() if events else []
    recovering_event_ids = {row.event_id for row in candidate_rows}
    binding = db.query(WeComConversationBinding).filter(
        WeComConversationBinding.project_id == project_id,
        WeComConversationBinding.platform_id == batch.platform_id,
        WeComConversationBinding.conversation_key == batch.conversation_key,
    ).first()
    action_status = binding.status if binding else "syncing"
    action_reason = binding.reason if binding else "群绑定尚未同步"
    can_dispatch = bool(
        binding and binding.status == "available" and binding.wecom_chat_id
        and current_staff and current_staff.wecom_userid
    )
    return ReplyMonitorTicketContext(
        ticket_id=ticket.id,
        ticket_number=ticket.number,
        batch=ReplyMonitorBatchContext(
            id=batch.id,
            status=batch.status,
            conversation_key=batch.conversation_key,
            conversation_type=batch.conversation_type,
            conversation_name=batch.conversation_name,
            platform_id=batch.platform_id,
            responsible_staff_id=batch.responsible_staff_id,
            actual_reply_staff_id=batch.actual_reply_staff_id,
            first_customer_at=batch.first_customer_at,
            first_reply_at=batch.first_reply_at,
            reminder_count=batch.reminder_count,
        ),
        timeline=[
            ReplyMonitorTimelineEvent(
                id=event.id,
                message_id=event.message_id,
                sender_kind=event.sender_kind,
                sender_id=event.sender_id,
                sender_name=event.sender_name,
                responsible_staff_id=event.responsible_staff_id,
                message_type=event.message_type,
                content_summary=event.content_summary,
                occurred_at=event.occurred_at,
                metadata=event.event_metadata or {},
                media=media_by_event.get(event.id, []),
                media_status=(
                    "ready" if media_by_event.get(event.id)
                    else "recovering" if event.id in recovering_event_ids
                    else "missing" if str(event.message_type).casefold() == "image"
                    else "ready"
                ),
                capture_source=(
                    media_by_event[event.id][0].capture_source
                    if media_by_event.get(event.id) else None
                ),
            )
            for event in events
        ],
        wecom_action=action_status,
        can_dispatch_to_wecom=can_dispatch,
        wecom_action_reason=(None if can_dispatch else action_reason or "当前客服未配置企微 UserID"),
    )
