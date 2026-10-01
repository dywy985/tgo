"""State machine and reporting for human reply monitoring."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from statistics import mean
from typing import Optional
import re
import unicodedata
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Platform, Staff, Ticket
from app.models.reply_monitor import (
    DEFAULT_WEEKLY_SCHEDULE,
    ReplyMonitorBatch,
    ReplyMonitorEvent,
    ReplyMonitorGroupCustomer,
    ReplyMonitorGroupPolicy,
    ReplyMonitorMedia,
    ReplyMonitorSettings,
)
from app.services.ticket_route_service import resolve_ticket_route
from app.services.reply_monitor_classifier import (
    authoritative_problem_metadata,
    is_resolution_text,
    is_substantive_staff_reply,
)


MEDIA_CONTEXT_WINDOW = timedelta(seconds=120)
PROBLEM_ESCALATION_WINDOW = timedelta(minutes=5)
MEDIA_PLACEHOLDERS = {"[图片]", "[image]"}


def dismiss_pending_batch(db: Session, project_id: UUID, batch_id: UUID) -> bool:
    """Remove a pending reminder without deleting its messages or linked ticket."""
    batch = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.id == batch_id,
        ReplyMonitorBatch.project_id == project_id,
        ReplyMonitorBatch.status == "pending",
    ).with_for_update().first()
    if batch is None:
        return False
    batch.status = "dismissed"
    batch.next_reminder_at = None
    batch.review_required = False
    db.commit()
    return True

def normalize_member_identity(value: Optional[str]) -> str:
    """Normalize WorkTool identities without losing non-Latin characters."""
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).split()).casefold()


def customer_identity_key(
    sender_id: Optional[str], sender_name: Optional[str], conversation_key: str
) -> str:
    """Build the stable key used to isolate concurrent customer batches."""
    normalized_id = normalize_member_identity(sender_id)
    if normalized_id:
        return f"userid:{normalized_id}"
    normalized_name = normalize_member_identity(sender_name)
    if normalized_name:
        return f"name:{normalized_name}"
    return f"conversation:{normalize_member_identity(conversation_key)}"


def normalize_message_text(value: Optional[str]) -> str:
    """Normalize text for quote matching without mutating the audited original."""
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    normalized = re.sub(r"@[\w\-\u4e00-\u9fff]+", " ", normalized)
    return re.sub(r"[\s\W_]+", "", normalized, flags=re.UNICODE)


def is_customer_resolution_text(value: Optional[str]) -> bool:
    """Recognize an unambiguous customer confirmation that its own issue is resolved."""
    return is_resolution_text(value)


def quoted_event_matches(
    event,
    quoted_sender_id: Optional[str],
    quoted_sender_name: Optional[str],
    quoted_content: Optional[str],
) -> bool:
    """Match one structured quote to one historical event conservatively."""
    expected_id = normalize_member_identity(quoted_sender_id)
    expected_name = normalize_member_identity(quoted_sender_name)
    if expected_id:
        if normalize_member_identity(getattr(event, "sender_id", None)) != expected_id:
            return False
    elif expected_name:
        if normalize_member_identity(getattr(event, "sender_name", None)) != expected_name:
            return False
    else:
        return False
    expected_content = normalize_message_text(quoted_content)
    if not expected_content:
        return True
    event_content = (
        getattr(event, "normalized_content", None)
        or getattr(event, "current_content", None)
        or getattr(event, "content_summary", None)
    )
    return normalize_message_text(event_content) == expected_content


def select_reply_batch(
    pending_batches: list,
    quoted_events: list,
    *,
    allow_unquoted_single: bool = False,
):
    """Resolve a reply conservatively; ambiguous replies never close a batch."""
    pending_by_id = {getattr(batch, "id", None): batch for batch in pending_batches}
    quoted_batch_ids = {
        getattr(event, "batch_id", None)
        for event in quoted_events
        if getattr(event, "batch_id", None) in pending_by_id
    }
    if len(quoted_batch_ids) == 1:
        batch_id = next(iter(quoted_batch_ids))
        return pending_by_id[batch_id], "matched_quote"
    if quoted_batch_ids:
        return None, "ambiguous"
    if allow_unquoted_single and len(pending_batches) == 1:
        return pending_batches[0], "matched_single"
    if len(pending_batches) > 1:
        return None, "ambiguous"
    return None, "unmatched"


def has_problem_escalation_context(
    events: list, identity_key: str, occurred_at: datetime
) -> bool:
    """Return whether a 30-49 score has recent evidence from the same customer."""
    cutoff = _as_utc(occurred_at) - PROBLEM_ESCALATION_WINDOW
    has_evidence = False
    for row in sorted(events, key=lambda item: _as_utc(item.occurred_at)):
        when = _as_utc(row.occurred_at)
        if when < cutoff or when >= _as_utc(occurred_at):
            continue
        if getattr(row, "sender_kind", None) == "staff":
            has_evidence = False
            continue
        if getattr(row, "sender_kind", None) != "customer":
            continue
        row_identity = customer_identity_key(
            getattr(row, "sender_id", None),
            getattr(row, "sender_name", None),
            "",
        )
        if row_identity != identity_key:
            continue
        message_type = str(getattr(row, "message_type", "") or "").lower()
        summary = str(getattr(row, "content_summary", "") or "").strip().lower()
        metadata = dict(getattr(row, "event_metadata", None) or {})
        try:
            previous_score = int(metadata.get("problem_score", 0))
        except (TypeError, ValueError):
            previous_score = 0
        if message_type == "image" or summary in MEDIA_PLACEHOLDERS or previous_score >= 30:
            has_evidence = True
    return has_evidence


def _staff_matches_group_owner_name(staff: Staff, owner_name: str) -> bool:
    """Match a detected group owner to exactly one local staff identity.

    A missing WeCom UserID must not prevent the owner from becoming the
    responsible staff member when their normalized name is unambiguous.
    """
    normalized_owner = normalize_member_identity(owner_name)
    if not normalized_owner:
        return False
    owner_candidates = {normalized_owner}
    # WorkTool may expose an external-contact label such as
    # ``蓝健13500000004`` (synthetic number) while the staff record is ``蓝健``.
    # Keep the original value as a candidate and only strip a trailing mainland
    # mobile number, so ordinary digits in usernames are not broadly ignored.
    without_mobile = re.sub(r"(?:(?:\+?86[-\s]?)?1\d{10})$", "", normalized_owner).strip()
    if without_mobile:
        owner_candidates.add(without_mobile)
    return bool(owner_candidates & {
        normalize_member_identity(getattr(staff, field, None))
        for field in ("name", "nickname", "username")
        if getattr(staff, field, None)
    })


def classify_group_sender(
    customer_roster,
    *,
    sender_kind_hint: str,
    sender_id: Optional[str],
    sender_name: Optional[str],
) -> str:
    """Apply the configured-customer rule to one raw group sender."""
    hint = str(sender_kind_hint or "unknown").strip().lower()
    if hint == "system":
        return "system"
    if hint == "staff":
        return "staff"
    if not customer_roster:
        return "unknown"

    normalized_id = normalize_member_identity(sender_id)
    normalized_name = normalize_member_identity(sender_name)
    if not normalized_id and not normalized_name:
        return "unknown"
    for member in customer_roster:
        identity_type = str(getattr(member, "identity_type", "name") or "name")
        expected = normalize_member_identity(getattr(member, "identity_value", ""))
        if identity_type == "userid" and normalized_id and normalized_id == expected:
            return "customer"
        if identity_type == "name" and normalized_name and normalized_name == expected:
            return "customer"
    return "staff"


def _sender_matches_group_owner(payload) -> bool:
    """Treat the detected group owner as an authoritative reply identity."""
    metadata = dict(getattr(payload, "metadata", None) or {})
    sender_id = normalize_member_identity(getattr(payload, "sender_id", None))
    owner_id = normalize_member_identity(metadata.get("group_owner_userid"))
    if sender_id and owner_id:
        return sender_id == owner_id
    sender_name = normalize_member_identity(getattr(payload, "sender_name", None))
    owner_name = normalize_member_identity(metadata.get("group_owner_name"))
    return bool(sender_name and owner_name and sender_name == owner_name)


def _known_internal_staff_for_sender(
    db: Session,
    project_id: UUID,
    sender_id: Optional[str],
    sender_name: Optional[str],
) -> Optional[Staff]:
    """Resolve one active internal account, preferring its stable WeCom UserID."""
    staff_rows = db.query(Staff).filter(
        Staff.project_id == project_id,
        Staff.is_active.is_(True),
        Staff.deleted_at.is_(None),
        Staff.role != "agent",
    ).all()
    normalized_id = normalize_member_identity(sender_id)
    if normalized_id:
        by_id = [
            staff for staff in staff_rows
            if normalize_member_identity(getattr(staff, "wecom_userid", None)) == normalized_id
        ]
        if len(by_id) == 1:
            return by_id[0]

    normalized_name = normalize_member_identity(sender_name)
    if not normalized_name:
        return None
    by_name = []
    for staff in staff_rows:
        configured_userid = normalize_member_identity(
            getattr(staff, "wecom_userid", None)
        )
        if normalized_id and configured_userid and configured_userid != normalized_id:
            continue
        identities = {
            normalize_member_identity(getattr(staff, field, None))
            for field in ("name", "nickname", "username")
        }
        if normalized_name in identities:
            by_name.append(staff)
    return by_name[0] if len(by_name) == 1 else None


def effective_sender_kind_for_event(db: Session, platform: Platform, payload) -> str:
    """Resolve sender side at the API boundary, where project roster state lives."""
    hint = str(payload.sender_kind or "unknown").strip().lower()
    if hint == "system":
        return "system"
    if payload.conversation_type == "group" and _sender_matches_group_owner(payload):
        return "staff"
    if _known_internal_staff_for_sender(
        db, platform.project_id, payload.sender_id, payload.sender_name
    ):
        return "staff"
    if payload.conversation_type != "group":
        return hint if hint in {"customer", "staff", "system"} else "unknown"
    roster = db.query(ReplyMonitorGroupCustomer).filter(
        ReplyMonitorGroupCustomer.project_id == platform.project_id,
        ReplyMonitorGroupCustomer.platform_id == platform.id,
        ReplyMonitorGroupCustomer.conversation_key == payload.conversation_key,
    ).all()
    policy = db.query(ReplyMonitorGroupPolicy).filter(
        ReplyMonitorGroupPolicy.project_id == platform.project_id,
        ReplyMonitorGroupPolicy.platform_id == platform.id,
        ReplyMonitorGroupPolicy.conversation_key == payload.conversation_key,
        ReplyMonitorGroupPolicy.roster_confirmed.is_(True),
    ).first()
    if policy is None:
        # A new group starts in automatic mode: once group-owner and known
        # internal-staff checks above have failed, an identifiable participant
        # is treated as a customer. Saving a roster switches the group to the
        # explicit list below, so operators can remove false positives.
        if normalize_member_identity(payload.sender_id) or normalize_member_identity(
            payload.sender_name
        ):
            return "customer"
        return "unknown"
    return classify_group_sender(
        roster,
        sender_kind_hint=hint,
        sender_id=payload.sender_id,
        sender_name=payload.sender_name,
    )


def apply_group_roster_to_unknown_events(events, customer_roster) -> list:
    """Reclassify candidate group events and return rows whose side changed."""
    changed = []
    for event in events:
        if str(getattr(event, "sender_kind", "")) == "system":
            continue
        effective = classify_group_sender(
            customer_roster,
            sender_kind_hint="unknown",
            sender_id=getattr(event, "sender_id", None),
            sender_name=getattr(event, "sender_name", None),
        )
        if effective != "unknown" and effective != event.sender_kind:
            event.sender_kind = effective
            changed.append(event)
    return changed


def reclassify_unknown_group_events(
    db: Session, project_id: UUID, platform_id: UUID, conversation_key: str
) -> int:
    """Apply a newly saved roster to unresolved history for one group."""
    roster = db.query(ReplyMonitorGroupCustomer).filter(
        ReplyMonitorGroupCustomer.project_id == project_id,
        ReplyMonitorGroupCustomer.platform_id == platform_id,
        ReplyMonitorGroupCustomer.conversation_key == conversation_key,
    ).all()
    pending = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.project_id == project_id,
        ReplyMonitorBatch.platform_id == platform_id,
        ReplyMonitorBatch.conversation_key == conversation_key,
        ReplyMonitorBatch.status == "pending",
    ).with_for_update().first()
    candidate_filter = ReplyMonitorEvent.batch_id.is_(None)
    if pending is not None:
        candidate_filter = or_(candidate_filter, ReplyMonitorEvent.batch_id == pending.id)
    events = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.project_id == project_id,
        ReplyMonitorEvent.platform_id == platform_id,
        ReplyMonitorEvent.conversation_key == conversation_key,
        candidate_filter,
    ).order_by(ReplyMonitorEvent.occurred_at.asc()).all()
    changed = apply_group_roster_to_unknown_events(events, roster)

    if pending is not None:
        first_reply = next(
            (
                event for event in events
                if event.sender_kind == "staff" and event.occurred_at >= pending.first_customer_at
            ),
            None,
        )
        if first_reply is not None:
            metadata = dict(first_reply.event_metadata or {})
            actual_staff = _staff_for_event(
                db, project_id, "staff", first_reply.sender_id, first_reply.sender_name, metadata
            )
            first_reply.resolved_staff_id = actual_staff.id if actual_staff else None
            first_reply.batch_id = pending.id
            pending.status = "answered"
            pending.actual_reply_staff_id = actual_staff.id if actual_staff else None
            pending.actual_reply_name = first_reply.sender_name
            pending.first_reply_at = first_reply.occurred_at
            pending.next_reminder_at = None
            from app.services.reply_monitor_ticket_service import ensure_answered_reply_monitor_ticket

            timezone_name = get_or_create_settings(db, project_id).timezone
            ensure_answered_reply_monitor_ticket(
                db, pending, actual_staff, first_reply.occurred_at, timezone_name
            )
    return len(changed)


def select_recent_media_context(events, occurred_at: datetime) -> list:
    """Return consecutive unbatched customer images before a qualifying text."""
    cutoff = _as_utc(occurred_at) - MEDIA_CONTEXT_WINDOW
    selected = []
    for row in sorted(events, key=lambda item: _as_utc(item.occurred_at)):
        when = _as_utc(row.occurred_at)
        if when < cutoff or when >= _as_utc(occurred_at):
            continue
        if row.sender_kind == "staff":
            selected.clear()
            continue
        is_media = (
            row.sender_kind == "customer"
            and row.batch_id is None
            and (
                str(row.message_type or "").lower() == "image"
                or str(row.content_summary or "").strip().lower() in MEDIA_PLACEHOLDERS
            )
        )
        if is_media:
            selected.append(row)
    return selected


def get_or_create_settings(db: Session, project_id: UUID) -> ReplyMonitorSettings:
    row = db.get(ReplyMonitorSettings, project_id)
    if row is None:
        row = ReplyMonitorSettings(
            project_id=project_id,
            weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
            notification_channels={"in_app": True, "wecom_app": True},
        )
        db.add(row)
        db.flush()
    return row


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def resolve_timezone(name: str):
    """Resolve a configured timezone, with a portable Shanghai fallback."""
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        if name == "Asia/Shanghai":
            return timezone(timedelta(hours=8), name="Asia/Shanghai")
        raise


def _bound_staff_matches_event(
    staff: Staff,
    sender_id: Optional[str],
    sender_name: Optional[str],
    metadata: dict,
) -> bool:
    """Return whether an unresolved staff event is from the phone owner.

    ``bound_staff_id`` identifies the account logged in on the phone, not every
    enterprise member whose message is visible on that phone.  Therefore the
    binding is only a safe identity fallback when the event also matches the
    bound account's immutable UserID or one of its exact display identities.
    """
    bound_userid = str(metadata.get("bound_wecom_userid") or "").strip()
    normalized_sender_id = str(sender_id or "").strip().casefold()
    if normalized_sender_id and bound_userid:
        return normalized_sender_id == bound_userid.casefold()

    normalized_name = str(sender_name or "").strip().casefold()
    if not normalized_name:
        return False
    identities = {
        str(value or "").strip().casefold()
        for value in (
            getattr(staff, "wecom_userid", None),
            getattr(staff, "name", None),
            getattr(staff, "nickname", None),
            getattr(staff, "username", None),
        )
        if str(value or "").strip()
    }
    return normalized_name in identities


def _unique_staff_by_exact_identity(
    staff_rows: list[Staff], sender_name: Optional[str]
) -> Optional[Staff]:
    """Resolve an exact display identity only when it maps to one configured UserID."""
    normalized_name = str(sender_name or "").strip().casefold()
    if not normalized_name:
        return None
    matches = []
    for staff in staff_rows:
        if not str(getattr(staff, "wecom_userid", None) or "").strip():
            continue
        identities = {
            str(value or "").strip().casefold()
            for value in (
                getattr(staff, "wecom_userid", None),
                getattr(staff, "name", None),
                getattr(staff, "nickname", None),
                getattr(staff, "username", None),
            )
            if str(value or "").strip()
        }
        if normalized_name in identities:
            matches.append(staff)
    return matches[0] if len(matches) == 1 else None


def _staff_for_event(
    db: Session,
    project_id: UUID,
    sender_kind: str,
    sender_id: Optional[str],
    sender_name: Optional[str],
    metadata: dict,
) -> Optional[Staff]:
    if sender_id:
        staff = db.query(Staff).filter(
            Staff.project_id == project_id,
            Staff.wecom_userid == sender_id,
            Staff.deleted_at.is_(None),
            Staff.role != "agent",
        ).first()
        if staff:
            return staff
    if sender_kind == "staff" and metadata.get("bound_staff_id"):
        try:
            bound_id = UUID(str(metadata["bound_staff_id"]))
        except (ValueError, TypeError):
            return None
        bound_staff = db.query(Staff).filter(
            Staff.id == bound_id, Staff.project_id == project_id,
            Staff.deleted_at.is_(None), Staff.role != "agent",
        ).first()
        if bound_staff and _bound_staff_matches_event(
            bound_staff, sender_id, sender_name, metadata
        ):
            return bound_staff
    if sender_kind == "staff" and sender_name:
        exact_matches = db.query(Staff).filter(
            Staff.project_id == project_id,
            Staff.deleted_at.is_(None),
            Staff.role != "agent",
            Staff.wecom_userid.isnot(None),
            or_(
                Staff.name == sender_name,
                Staff.nickname == sender_name,
                Staff.username == sender_name,
                Staff.wecom_userid == sender_name,
            ),
        ).all()
        return _unique_staff_by_exact_identity(exact_matches, sender_name)
    return None


def _responsible_staff_id(db: Session, platform: Platform, conversation_type: str, conversation_key: str, metadata: dict) -> Optional[UUID]:
    if conversation_type == "private" and metadata.get("bound_staff_id"):
        try:
            staff_id = UUID(str(metadata["bound_staff_id"]))
        except (ValueError, TypeError):
            return None
        exists = db.query(Staff.id).filter(Staff.id == staff_id, Staff.project_id == platform.project_id, Staff.deleted_at.is_(None)).first()
        return staff_id if exists else None
    staff, _ = resolve_group_responsibility(
        db, platform, conversation_key, metadata
    )
    return staff.id if staff else None


def resolve_group_responsibility(
    db: Session, platform: Platform, conversation_key: str, metadata: dict
) -> tuple[Optional[Staff], str]:
    """Resolve the immutable owner snapshot for a newly opened group batch."""
    route = resolve_ticket_route(
        db,
        project_id=platform.project_id,
        platform_id=getattr(platform, "id", None),
        group_key=conversation_key,
    )
    if route:
        staff = db.query(Staff).filter(
            Staff.id == route.staff_id,
            Staff.project_id == platform.project_id,
            Staff.is_active.is_(True),
            Staff.deleted_at.is_(None),
            Staff.role != "agent",
        ).first()
        if staff:
            return staff, "manual_override"

    owner_userid = str(metadata.get("group_owner_userid") or "").strip()
    if owner_userid:
        owner = db.query(Staff).filter(
            Staff.project_id == platform.project_id,
            Staff.wecom_userid == owner_userid,
            Staff.is_active.is_(True),
            Staff.deleted_at.is_(None),
            Staff.role != "agent",
        ).first()
        if owner:
            return owner, "group_owner"

    owner_name = str(metadata.get("group_owner_name") or "").strip()
    if not owner_name:
        return None, "unmatched"
    owner_candidates = db.query(Staff).filter(
        Staff.project_id == platform.project_id,
        Staff.is_active.is_(True),
        Staff.deleted_at.is_(None),
        Staff.role != "agent",
    ).all()
    owners = [
        staff for staff in owner_candidates
        if _staff_matches_group_owner_name(staff, owner_name)
    ]
    return (owners[0], "group_owner") if len(owners) == 1 else (None, "unmatched")


def should_open_problem_batch(metadata: dict, *, has_context: bool = False) -> bool:
    """Whether a customer event should create a new pending question.

    Only an explicit, valid score can open a batch. Once a batch is open, all
    customer supplements are attached regardless of their individual score.
    """
    if metadata.get("media_only") is True:
        return False
    raw_score = metadata.get("problem_score")
    if raw_score is None:
        return False
    try:
        score = int(raw_score)
        threshold = int(metadata.get("problem_threshold", 50))
    except (TypeError, ValueError):
        return False
    if score >= threshold:
        return True
    return 30 <= score < threshold and has_context


def apply_image_text_analysis(db: Session, platform: Platform, event: ReplyMonitorEvent, analysis):
    """Audit OCR output and promote a customer image to a timed problem batch."""
    metadata = dict(event.event_metadata or {})
    metadata.update({
        "ocr_status": analysis.status,
        "ocr_text": analysis.text or None,
        "ocr_error_code": analysis.error_code,
        "ocr_engine": "tesseract-chi_sim+eng",
    })
    if analysis.status == "recognized":
        metadata.update({
            "problem_score": analysis.problem_score,
            "problem_threshold": 50,
            "problem_rule_version": analysis.problem_rule_version,
            "problem_reasons": list(analysis.problem_reasons),
            "normalized_text": normalize_message_text(analysis.text),
            "media_only": False,
            "problem_source": "image_ocr",
        })
        event.normalized_content = normalize_message_text(analysis.text)
        event.problem_rule_version = analysis.problem_rule_version
        event.problem_reasons = list(analysis.problem_reasons)
    event.event_metadata = metadata

    if (
        event.sender_kind != "customer"
        or event.batch_id is not None
        or not should_open_problem_batch(metadata)
    ):
        db.commit()
        return None

    identity_key = customer_identity_key(
        event.sender_id, event.sender_name, event.conversation_key
    )
    pending = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.project_id == platform.project_id,
        ReplyMonitorBatch.platform_id == platform.id,
        ReplyMonitorBatch.conversation_key == event.conversation_key,
        ReplyMonitorBatch.customer_identity_key == identity_key,
        ReplyMonitorBatch.status == "pending",
    ).with_for_update().first()
    if pending is None:
        settings = get_or_create_settings(db, platform.project_id)
        owner = _responsible_staff_id(
            db, platform, event.conversation_type, event.conversation_key, metadata
        )
        pending = ReplyMonitorBatch(
            project_id=platform.project_id,
            platform_id=platform.id,
            conversation_key=event.conversation_key,
            conversation_type=event.conversation_type,
            conversation_name=event.conversation_name,
            responsible_staff_id=owner,
            customer_identity_key=identity_key,
            customer_sender_id=event.sender_id,
            customer_sender_name=event.sender_name,
            channel_open_id=event.channel_open_id or metadata.get("channel_open_id"),
            is_problem_candidate=True,
            first_customer_at=event.occurred_at,
            last_customer_at=event.occurred_at,
            customer_message_count=1,
            next_reminder_at=add_working_minutes(
                event.occurred_at, settings.first_reminder_minutes, settings
            ),
        )
        db.add(pending)
        db.flush()
    event.batch_id = pending.id
    event.responsible_staff_id = pending.responsible_staff_id
    db.query(ReplyMonitorMedia).filter(
        ReplyMonitorMedia.event_id == event.id
    ).update({ReplyMonitorMedia.batch_id: pending.id}, synchronize_session=False)
    db.commit()
    return pending


def add_working_minutes(start: datetime, minutes: int, settings: ReplyMonitorSettings) -> datetime:
    """Return UTC instant after N configured service minutes."""
    try:
        tz = resolve_timezone(settings.timezone)
    except ZoneInfoNotFoundError:
        tz = timezone(timedelta(hours=8), name="Asia/Shanghai")
    cursor = _as_utc(start).astimezone(tz).replace(second=0, microsecond=0)
    remaining = max(0, minutes)
    # Bounded minute walk; configured limits cap reminders at practical values.
    for _ in range(60 * 24 * 370):
        day_ranges = (settings.weekly_schedule or DEFAULT_WEEKLY_SCHEDULE).get(str(cursor.weekday()), [])
        current = cursor.timetz().replace(tzinfo=None)
        active = any(time.fromisoformat(r["start"]) <= current < time.fromisoformat(r["end"]) for r in day_ranges)
        if active:
            if remaining == 0:
                return cursor.astimezone(timezone.utc)
            remaining -= 1
        cursor += timedelta(minutes=1)
    return cursor.astimezone(timezone.utc)


def working_minutes_between(start: datetime, end: datetime, settings: ReplyMonitorSettings) -> float:
    if end <= start:
        return 0.0
    due = add_working_minutes(start, 0, settings)
    count = 0
    while due < _as_utc(end) and count < 525600:
        nxt = add_working_minutes(due, 1, settings)
        if nxt > _as_utc(end):
            break
        count += 1
        due = nxt
    return float(count)


def next_reminder_for_batch(
    batch: ReplyMonitorBatch, settings: ReplyMonitorSettings
) -> datetime:
    """Rebuild the due time for the next reminder sequence."""
    elapsed_service_minutes = settings.first_reminder_minutes + (
        max(0, int(batch.reminder_count or 0)) * settings.repeat_reminder_minutes
    )
    return add_working_minutes(
        batch.first_customer_at, elapsed_service_minutes, settings
    )


def rearm_pending_batches(
    db: Session, project_id: UUID, settings: ReplyMonitorSettings
) -> int:
    """Restore schedules cleared by older disable/re-enable behavior."""
    rows = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.project_id == project_id,
        ReplyMonitorBatch.status == "pending",
        ReplyMonitorBatch.next_reminder_at.is_(None),
    ).all()
    changed = 0
    for batch in rows:
        needs_ticket = bool(
            batch.is_problem_candidate and batch.ticket_id is None
        )
        needs_reminder = batch.reminder_count < settings.max_reminders
        if not needs_ticket and not needs_reminder:
            continue
        batch.next_reminder_at = next_reminder_for_batch(batch, settings)
        changed += 1
    return changed


def ingest_event(
    db: Session,
    platform: Platform,
    payload,
    *,
    _retry_on_batch_race: bool = True,
) -> tuple[ReplyMonitorEvent, Optional[ReplyMonitorBatch], bool, bool]:
    existing = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.platform_id == platform.id,
        ReplyMonitorEvent.message_id == payload.message_id,
    ).first()
    if existing:
        batch = db.get(ReplyMonitorBatch, existing.batch_id) if existing.batch_id else None
        return existing, batch, True, False

    metadata = dict(payload.metadata or {})
    message_type = str(payload.message_type or "text").lower()
    current_content = (
        getattr(payload, "current_content", None)
        or metadata.get("current_content")
        or payload.content_summary
    )
    metadata = authoritative_problem_metadata(
        metadata, current_content, message_type
    )
    effective_kind = effective_sender_kind_for_event(db, platform, payload)
    actual_staff = _staff_for_event(
        db,
        platform.project_id,
        effective_kind,
        payload.sender_id,
        payload.sender_name,
        metadata,
    )
    occurred_at = _as_utc(payload.occurred_at)
    quoted_sender_id = getattr(payload, "quoted_sender_id", None) or metadata.get("quoted_sender_id")
    quoted_sender_name = getattr(payload, "quoted_sender_name", None) or metadata.get("quoted_sender_name")
    quoted_content = getattr(payload, "quoted_content", None) or metadata.get("quoted_content")
    quoted_message_type = getattr(payload, "quoted_message_type", None) or metadata.get("quoted_message_type")
    normalized_content = str(metadata.get("normalized_text") or normalize_message_text(current_content))
    problem_rule_version = metadata.get("problem_rule_version")
    problem_reasons = metadata.get("problem_reasons")
    event = ReplyMonitorEvent(
        project_id=platform.project_id, platform_id=platform.id, message_id=payload.message_id,
        robot_id=payload.robot_id, conversation_key=payload.conversation_key,
        conversation_type=payload.conversation_type, conversation_name=payload.conversation_name,
        channel_open_id=metadata.get("channel_open_id"),
        sender_kind=effective_kind, sender_id=payload.sender_id, sender_name=payload.sender_name,
        message_type=payload.message_type, content_summary=payload.content_summary,
        current_content=current_content, normalized_content=normalized_content,
        problem_rule_version=problem_rule_version,
        problem_reasons=list(problem_reasons) if isinstance(problem_reasons, list) else None,
        quoted_sender_id=quoted_sender_id, quoted_sender_name=quoted_sender_name,
        quoted_content=quoted_content, quoted_message_type=quoted_message_type,
        event_metadata=metadata, occurred_at=occurred_at,
        resolved_staff_id=actual_staff.id if actual_staff else None,
    )
    db.add(event)
    if effective_kind in {"system", "unknown"}:
        db.commit()
        return event, None, False, True

    pending_batches = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.project_id == platform.project_id,
        ReplyMonitorBatch.platform_id == platform.id,
        ReplyMonitorBatch.conversation_key == payload.conversation_key,
        ReplyMonitorBatch.status == "pending",
    ).with_for_update().all()
    settings = get_or_create_settings(db, platform.project_id)
    batch = None

    quoted_events = []
    if pending_batches and (quoted_sender_id or quoted_sender_name):
        pending_ids = [row.id for row in pending_batches]
        quote_candidates = db.query(ReplyMonitorEvent).filter(
            ReplyMonitorEvent.project_id == platform.project_id,
            ReplyMonitorEvent.platform_id == platform.id,
            ReplyMonitorEvent.conversation_key == payload.conversation_key,
            ReplyMonitorEvent.batch_id.in_(pending_ids),
            ReplyMonitorEvent.sender_kind == "customer",
        ).order_by(ReplyMonitorEvent.occurred_at.desc()).all()
        quoted_events = [
            row for row in quote_candidates
            if quoted_event_matches(row, quoted_sender_id, quoted_sender_name, quoted_content)
        ]
        if len(quoted_events) == 1:
            event.quote_target_event_id = quoted_events[0].id

    def close_batch(target, actor_kind: str, match_status: str, staff: Optional[Staff]) -> None:
        target.status = "answered"
        target.actual_reply_staff_id = staff.id if staff else None
        target.actual_reply_name = payload.sender_name
        target.reply_actor_kind = actor_kind
        target.reply_match_status = match_status
        target.review_required = False
        target.first_reply_at = occurred_at
        target.next_reminder_at = None
        event.batch_id = target.id
        event.reply_actor_kind = actor_kind
        event.reply_match_status = match_status
        db.flush()
        from app.services.reply_monitor_ticket_service import ensure_answered_reply_monitor_ticket

        ensure_answered_reply_monitor_ticket(db, target, staff, occurred_at, settings.timezone)

    if effective_kind == "customer":
        identity_key = customer_identity_key(
            payload.sender_id, payload.sender_name, payload.conversation_key
        )
        batch = next(
            (row for row in pending_batches if row.customer_identity_key == identity_key),
            None,
        )
        try:
            problem_score = int(metadata.get("problem_score", 0))
        except (TypeError, ValueError):
            problem_score = 0
        quoted_batch, quote_status = select_reply_batch(pending_batches, quoted_events)
        if batch is not None and is_customer_resolution_text(current_content):
            close_batch(batch, "customer_self", "matched_self_resolution", None)
        elif quoted_batch is not None and quoted_batch.customer_identity_key != identity_key and problem_score < 30:
            batch = quoted_batch
            close_batch(batch, "customer_peer", quote_status, None)
        elif batch:
            if (
                payload.conversation_type == "group"
                and batch.responsible_staff_id is None
            ):
                owner = _responsible_staff_id(
                    db,
                    platform,
                    payload.conversation_type,
                    payload.conversation_key,
                    metadata,
                )
                if owner:
                    batch.responsible_staff_id = owner
                    if batch.ticket_id:
                        ticket = db.get(Ticket, batch.ticket_id)
                        if ticket and ticket.assignee_id is None:
                            ticket.assignee_id = owner
            batch.last_customer_at = occurred_at
            batch.customer_message_count += 1
            event.responsible_staff_id = batch.responsible_staff_id
        else:
            recent_rows = db.query(ReplyMonitorEvent).filter(
                ReplyMonitorEvent.project_id == platform.project_id,
                ReplyMonitorEvent.platform_id == platform.id,
                ReplyMonitorEvent.conversation_key == payload.conversation_key,
                ReplyMonitorEvent.occurred_at >= occurred_at - PROBLEM_ESCALATION_WINDOW,
                ReplyMonitorEvent.occurred_at < occurred_at,
            ).order_by(ReplyMonitorEvent.occurred_at.asc()).all()
            same_customer_rows = [
                row for row in recent_rows
                if row.sender_kind == "customer" and customer_identity_key(
                    row.sender_id, row.sender_name, row.conversation_key
                ) == identity_key
            ]
            media_context_rows = [
                row for row in recent_rows
                if row.sender_kind == "staff" or row in same_customer_rows
            ]
            has_context = has_problem_escalation_context(
                media_context_rows, identity_key, occurred_at
            )
            if not should_open_problem_batch(metadata, has_context=has_context):
                event.responsible_staff_id = _responsible_staff_id(
                    db, platform, payload.conversation_type, payload.conversation_key, metadata
                )
                db.commit()
                db.refresh(event)
                return event, None, False, True
            media_context = select_recent_media_context(media_context_rows, occurred_at)
            first_customer_at = media_context[0].occurred_at if media_context else occurred_at
            owner = _responsible_staff_id(db, platform, payload.conversation_type, payload.conversation_key, metadata)
            event.responsible_staff_id = owner
            batch = ReplyMonitorBatch(
                project_id=platform.project_id, platform_id=platform.id,
                conversation_key=payload.conversation_key, conversation_type=payload.conversation_type,
                conversation_name=payload.conversation_name, responsible_staff_id=owner,
                customer_identity_key=identity_key,
                customer_sender_id=payload.sender_id,
                customer_sender_name=payload.sender_name,
                channel_open_id=metadata.get("channel_open_id"),
                is_problem_candidate=True,
                first_customer_at=first_customer_at, last_customer_at=occurred_at,
                customer_message_count=1 + len(media_context),
                next_reminder_at=add_working_minutes(first_customer_at, settings.first_reminder_minutes, settings),
            )
            db.add(batch)
            db.flush()
            if media_context:
                context_ids = [row.id for row in media_context]
                for row in media_context:
                    row.batch_id = batch.id
                    row.responsible_staff_id = owner
                db.query(ReplyMonitorMedia).filter(
                    ReplyMonitorMedia.event_id.in_(context_ids)
                ).update({ReplyMonitorMedia.batch_id: batch.id}, synchronize_session=False)
    elif effective_kind == "staff":
        batch, match_status = select_reply_batch(
            pending_batches,
            quoted_events,
            allow_unquoted_single=is_substantive_staff_reply(
                current_content, message_type
            ),
        )
        event.reply_match_status = match_status
        if batch:
            close_batch(batch, "staff", match_status, actual_staff)
        elif match_status == "ambiguous":
            for pending in pending_batches:
                pending.review_required = True
                pending.reply_match_status = "ambiguous"

    if batch:
        event.batch_id = batch.id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(ReplyMonitorEvent).filter(
            ReplyMonitorEvent.platform_id == platform.id, ReplyMonitorEvent.message_id == payload.message_id
        ).first()
        if existing:
            batch = db.get(ReplyMonitorBatch, existing.batch_id) if existing.batch_id else None
            return existing, batch, True, False
        # A distinct customer message may race while creating the first pending
        # batch. The partial unique index selects one winner; retry joins it.
        if not _retry_on_batch_race:
            raise
        return ingest_event(db, platform, payload, _retry_on_batch_race=False)
    db.refresh(event)
    if batch:
        db.refresh(batch)
    return event, batch, False, False


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = (len(ordered) - 1) * p
    lo, hi = int(idx), min(int(idx) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (idx - lo)


def build_stats(
    db: Session,
    project_id: UUID,
    start_date: date,
    end_date: date,
    staff_id=None,
    conversation_key=None,
    platform_id=None,
    responder_id=None,
    allowed_platform_ids=None,
) -> dict:
    settings = get_or_create_settings(db, project_id)
    tz = resolve_timezone(settings.timezone)
    start = datetime.combine(start_date, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    batch_cutover = select(Platform.connection_cutover_at).where(Platform.id == ReplyMonitorBatch.platform_id).scalar_subquery()
    q = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.project_id == project_id,
        ReplyMonitorBatch.first_customer_at >= start,
        ReplyMonitorBatch.first_customer_at < end,
        or_(
            batch_cutover.is_(None),
            ReplyMonitorBatch.first_customer_at >= batch_cutover,
        ),
    )
    if staff_id: q = q.filter(ReplyMonitorBatch.responsible_staff_id == staff_id)
    if responder_id: q = q.filter(ReplyMonitorBatch.actual_reply_staff_id == responder_id)
    if conversation_key: q = q.filter(ReplyMonitorBatch.conversation_key == conversation_key)
    if platform_id: q = q.filter(ReplyMonitorBatch.platform_id == platform_id)
    if allowed_platform_ids is not None:
        q = q.filter(ReplyMonitorBatch.platform_id.in_(allowed_platform_ids))
    batches = q.all()

    # "客户原始消息" is an event metric, not a problem-batch metric.  A valid
    # customer message may intentionally stay outside a batch when its problem
    # score is below the configured threshold, but it must still contribute to
    # traffic totals and group/day breakdowns.
    selected_batch_ids = {b.id for b in batches}
    event_scope = [
        (
            ReplyMonitorEvent.batch_id.is_(None)
            & (ReplyMonitorEvent.occurred_at >= start)
            & (ReplyMonitorEvent.occurred_at < end)
        )
    ]
    if selected_batch_ids:
        event_scope.append(ReplyMonitorEvent.batch_id.in_(selected_batch_ids))
    event_cutover = select(Platform.connection_cutover_at).where(Platform.id == ReplyMonitorEvent.platform_id).scalar_subquery()
    event_q = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.project_id == project_id,
        ReplyMonitorEvent.sender_kind == "customer",
        or_(*event_scope),
        or_(
            event_cutover.is_(None),
            ReplyMonitorEvent.occurred_at >= event_cutover,
        ),
    )
    if conversation_key:
        event_q = event_q.filter(ReplyMonitorEvent.conversation_key == conversation_key)
    if platform_id:
        event_q = event_q.filter(ReplyMonitorEvent.platform_id == platform_id)
    if allowed_platform_ids is not None:
        event_q = event_q.filter(ReplyMonitorEvent.platform_id.in_(allowed_platform_ids))
    customer_events = event_q.all()

    if responder_id:
        customer_events = [event for event in customer_events if event.batch_id in selected_batch_ids]
    elif staff_id:
        def belongs_to_selected_staff(event) -> bool:
            metadata = event.event_metadata or {}
            return (
                getattr(event, "responsible_staff_id", None) == staff_id
                or event.batch_id in selected_batch_ids
                or str(metadata.get("bound_staff_id") or "") == str(staff_id)
            )

        customer_events = [event for event in customer_events if belongs_to_selected_staff(event)]

    ticket_ids = {getattr(b, "ticket_id", None) for b in batches if getattr(b, "ticket_id", None)}
    tickets = db.query(Ticket).filter(Ticket.id.in_(ticket_ids)).all() if ticket_ids else []
    tickets_by_id = {ticket.id: ticket for ticket in tickets}

    def aggregate(items, customer_message_count=0):
        answered = [b for b in items if b.status == "answered" and b.first_reply_at]
        calendar_response = [
            max(0.0, (_as_utc(b.first_reply_at) - _as_utc(b.first_customer_at)).total_seconds() / 60)
            for b in answered
        ]
        working_response = [
            working_minutes_between(b.first_customer_at, b.first_reply_at, settings)
            for b in answered
        ]
        total = len(items)
        sla_minutes = getattr(settings, "first_reminder_minutes", 30)
        within_sla_count = sum(value <= sla_minutes for value in working_response)
        pending = [b for b in items if b.status == "pending"]
        now = datetime.now(timezone.utc)
        pending_minutes = [
            max(0.0, (now - _as_utc(b.first_customer_at)).total_seconds() / 60)
            for b in pending
        ]
        pending_working_minutes = [
            working_minutes_between(b.first_customer_at, now, settings)
            for b in pending
        ]
        reminder_counts = [getattr(b, "reminder_count", 0) or 0 for b in items]
        auto_tickets = [b for b in items if getattr(b, "ticket_id", None)]
        unresolved_tickets = [
            b for b in auto_tickets
            if getattr(tickets_by_id.get(b.ticket_id), "status", None)
            == "pending_reply"
        ]
        result = {
            "batch_count": total,
            "customer_message_count": customer_message_count,
            "answered": len(answered),
            "unanswered": total - len(answered),
            "response_rate": round(len(answered) * 100 / total, 2) if total else 0,
            "avg_calendar_first_response_minutes": round(mean(calendar_response), 2) if calendar_response else 0,
            "p50_calendar_first_response_minutes": round(_percentile(calendar_response, .5), 2),
            "p95_calendar_first_response_minutes": round(_percentile(calendar_response, .95), 2),
            "max_calendar_first_response_minutes": round(max(calendar_response), 2) if calendar_response else 0,
            "avg_working_first_response_minutes": round(mean(working_response), 2) if working_response else 0,
            "p50_working_first_response_minutes": round(_percentile(working_response, .5), 2),
            "p95_working_first_response_minutes": round(_percentile(working_response, .95), 2),
            "max_working_first_response_minutes": round(max(working_response), 2) if working_response else 0,
            "within_sla_count": within_sla_count,
            "within_sla_rate": round(within_sla_count * 100 / len(answered), 2) if answered else 0,
            "avg_reminder_count": round(mean(reminder_counts), 2) if reminder_counts else 0,
            "auto_ticket_count": len(auto_tickets),
            "unresolved_ticket_count": len(unresolved_tickets),
            "longest_pending_minutes": round(max(pending_minutes), 2) if pending_minutes else 0,
            "longest_pending_working_minutes": (
                round(max(pending_working_minutes), 2) if pending_working_minutes else 0
            ),
        }
        # Backward-compatible aliases use configured working time.
        result.update({
            "avg_first_response_minutes": result["avg_working_first_response_minutes"],
            "p50_first_response_minutes": result["p50_working_first_response_minutes"],
            "p95_first_response_minutes": result["p95_working_first_response_minutes"],
        })
        return result

    by_day, by_staff, by_group = {}, {}, {}
    for b in batches:
        day = b.first_customer_at.astimezone(tz).date().isoformat()
        by_day.setdefault(day, []).append(b)
        by_staff.setdefault(str(b.responsible_staff_id or "unassigned"), []).append(b)
        by_group.setdefault(b.conversation_key, []).append(b)
    event_by_day, event_by_staff, event_by_group, event_group_names = {}, {}, {}, {}
    batch_by_id = {b.id: b for b in batches}
    batch_staff_by_id = {b.id: b.responsible_staff_id for b in batches}
    for event in customer_events:
        event_batch = batch_by_id.get(event.batch_id)
        day_source = event_batch.first_customer_at if event_batch else event.occurred_at
        day = day_source.astimezone(tz).date().isoformat()
        event_by_day[day] = event_by_day.get(day, 0) + 1
        metadata = event.event_metadata or {}
        responsible_id = (
            getattr(event, "responsible_staff_id", None)
            or batch_staff_by_id.get(event.batch_id)
            or metadata.get("bound_staff_id")
        )
        staff_key = str(responsible_id or "unassigned")
        event_by_staff[staff_key] = event_by_staff.get(staff_key, 0) + 1
        event_by_group[event.conversation_key] = event_by_group.get(event.conversation_key, 0) + 1
        if event.conversation_name:
            event_group_names[event.conversation_key] = event.conversation_name

    staff_ids = {b.responsible_staff_id for b in batches if b.responsible_staff_id}
    staff_ids.update(
        b.actual_reply_staff_id for b in batches if getattr(b, "actual_reply_staff_id", None)
    )
    for key in event_by_staff:
        if key != "unassigned":
            try:
                staff_ids.add(UUID(key))
            except (TypeError, ValueError):
                pass
    staff_names = {
        str(s.id): (s.name or s.nickname or s.username)
        for s in db.query(Staff).filter(Staff.id.in_(staff_ids)).all()
    } if staff_ids else {}
    day_keys = sorted(set(by_day) | set(event_by_day))
    responder_batches = {}
    for batch in batches:
        if getattr(batch, "actual_reply_staff_id", None):
            responder_batches.setdefault(str(batch.actual_reply_staff_id), []).append(batch)
    staff_keys = set(by_staff) | set(event_by_staff) | set(responder_batches)
    group_keys = set(by_group) | set(event_by_group)
    return {"summary": aggregate(batches, len(customer_events)),
            "daily": [{"date": k, **aggregate(by_day.get(k, []), event_by_day.get(k, 0))} for k in day_keys],
            "staff_breakdown": [
                {
                    "staff_id": k,
                    "staff_name": staff_names.get(k, "未分配"),
                    **aggregate(by_staff.get(k, []), event_by_staff.get(k, 0)),
                    "assigned_questions": len(by_staff.get(k, [])),
                    "assigned_answered": sum(b.status == "answered" for b in by_staff.get(k, [])),
                    "assigned_unanswered": sum(b.status != "answered" for b in by_staff.get(k, [])),
                    "assigned_response_rate": (
                        round(sum(b.status == "answered" for b in by_staff.get(k, [])) * 100 / len(by_staff[k]), 2)
                        if by_staff.get(k) else 0
                    ),
                    "actual_replies": len(responder_batches.get(k, [])),
                    "cross_assist_count": sum(
                        getattr(b, "responsible_staff_id", None) is not None
                        and str(b.responsible_staff_id) != k
                        for b in responder_batches.get(k, [])
                    ),
                    "actual_response_metrics": aggregate(responder_batches.get(k, []), 0),
                }
                for k in staff_keys
            ],
            "group_breakdown": [{"conversation_key": k,
                                 "conversation_name": (by_group[k][0].conversation_name
                                                       if k in by_group else event_group_names.get(k)),
                                 **aggregate(by_group.get(k, []), event_by_group.get(k, 0))}
                                for k in group_keys]}
