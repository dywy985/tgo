"""Safe preview-token primitives for historical reply-monitor reconstruction."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy.orm import Session


from app.services.reply_monitor_classifier import (
    RULE_VERSION,
    classify_problem_text,
    is_substantive_staff_reply,
    normalize_problem_text,
)


def _normalized(value: str) -> str:
    return normalize_problem_text(value)


def score_problem_text(value: str, message_type: str = "text") -> tuple[int, list[str]]:
    result = classify_problem_text(value, message_type=message_type)
    return result.score, list(result.reasons)


def historical_event_order_key(event) -> tuple[datetime, datetime, str]:
    """Provide a total order when WorkTool reports several events in one second."""
    occurred_at = event.occurred_at
    created_at = getattr(event, "created_at", None) or occurred_at
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return (
        occurred_at.astimezone(timezone.utc),
        created_at.astimezone(timezone.utc),
        str(event.id),
    )


def create_preview_token(
    secret: str,
    project_id: str,
    platform_id: str,
    start_at: datetime,
    end_at: datetime,
    snapshot: str,
    expires_at: datetime,
) -> str:
    body = json.dumps({
        "project_id": project_id,
        "platform_id": platform_id,
        "start_at": start_at.astimezone(timezone.utc).isoformat(),
        "end_at": end_at.astimezone(timezone.utc).isoformat(),
        "snapshot": snapshot,
        "exp": int(expires_at.astimezone(timezone.utc).timestamp()),
    }, sort_keys=True, separators=(",", ":")).encode()
    encoded = base64.urlsafe_b64encode(body).rstrip(b"=").decode()
    signature = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def decode_preview_token(secret: str, token: str, *, now: datetime | None = None) -> dict:
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid preview token")
        padding = "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(encoded + padding))
        current = now or datetime.now(timezone.utc)
        if int(payload["exp"]) < int(current.astimezone(timezone.utc).timestamp()):
            raise ValueError("preview token expired")
        return payload
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ValueError("invalid or expired preview token") from exc


def snapshot_events(events: list, preview_items: list[dict] | None = None) -> str:
    event_payload = [{
        "id": str(row.id),
        "sender_kind": row.sender_kind,
        "batch_id": str(row.batch_id or ""),
        "content": row.current_content or row.content_summary or "",
        "quoted_sender_id": row.quoted_sender_id,
        "quoted_content": row.quoted_content,
        "occurred_at": row.occurred_at.isoformat(),
    } for row in events]
    proposal_payload = [{
        "event_id": str(item["event_id"]),
        "new_sender_kind": item["new_sender_kind"],
        "new_problem_score": item["new_problem_score"],
        "problem_reasons": item["problem_reasons"],
        "requires_manual_quote_review": item["requires_manual_quote_review"],
    } for item in (preview_items or [])]
    return hashlib.sha256(
        json.dumps(
            {"events": event_payload, "proposals": proposal_payload},
            ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        ).encode()
    ).hexdigest()


def preview_historical_window(
    db: Session, platform, start_at: datetime, end_at: datetime
) -> tuple[list, list[dict], str]:
    from app.models.reply_monitor import ReplyMonitorEvent
    from app.services import reply_monitor_service as monitor

    events = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.project_id == platform.project_id,
        ReplyMonitorEvent.platform_id == platform.id,
        ReplyMonitorEvent.occurred_at >= start_at,
        ReplyMonitorEvent.occurred_at < end_at,
    ).all()
    events.sort(key=historical_event_order_key)
    items = []
    for event in events:
        payload = SimpleNamespace(
            sender_kind=event.sender_kind,
            sender_id=event.sender_id,
            sender_name=event.sender_name,
            conversation_type=event.conversation_type,
            conversation_key=event.conversation_key,
            metadata=event.event_metadata or {},
        )
        proposed_kind = monitor.effective_sender_kind_for_event(db, platform, payload)
        score, reasons = score_problem_text(
            event.current_content or event.content_summary or "",
            event.message_type,
        )
        items.append({
            "event_id": event.id,
            "occurred_at": event.occurred_at,
            "conversation_key": event.conversation_key,
            "sender_name": event.sender_name,
            "old_sender_kind": event.sender_kind,
            "new_sender_kind": proposed_kind,
            "old_problem_score": (event.event_metadata or {}).get("problem_score"),
            "new_problem_score": score,
            "problem_reasons": reasons,
            "requires_manual_quote_review": bool(
                not event.quoted_content
                and "\n" in str(event.content_summary or "")
            ),
        })
    return events, items, snapshot_events(events, items)


def rebuild_historical_window(
    db: Session, platform, start_at: datetime, end_at: datetime
) -> dict:
    """Atomically replace derived batches while retaining the raw event inbox."""
    from app.models import Ticket
    from app.models.reply_monitor import (
        ReplyMonitorBatch, ReplyMonitorEvent, ReplyMonitorMedia, ReplyMonitorReminder,
    )
    from app.services import reply_monitor_service as monitor

    events, preview_items, _ = preview_historical_window(db, platform, start_at, end_at)
    old_batches = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.project_id == platform.project_id,
        ReplyMonitorBatch.platform_id == platform.id,
        ReplyMonitorBatch.first_customer_at >= start_at,
        ReplyMonitorBatch.first_customer_at < end_at,
    ).with_for_update().all()
    old_batch_ids = [row.id for row in old_batches]
    ticket_ids = [row.ticket_id for row in old_batches if row.ticket_id]
    if old_batch_ids:
        db.query(ReplyMonitorEvent).filter(
            ReplyMonitorEvent.batch_id.in_(old_batch_ids)
        ).update({ReplyMonitorEvent.batch_id: None}, synchronize_session=False)
        db.query(ReplyMonitorMedia).filter(
            ReplyMonitorMedia.batch_id.in_(old_batch_ids)
        ).update({ReplyMonitorMedia.batch_id: None}, synchronize_session=False)
        db.query(ReplyMonitorReminder).filter(
            ReplyMonitorReminder.batch_id.in_(old_batch_ids)
        ).delete(synchronize_session=False)
        if ticket_ids:
            db.query(Ticket).filter(Ticket.id.in_(ticket_ids)).delete(synchronize_session=False)
        db.query(ReplyMonitorBatch).filter(
            ReplyMonitorBatch.id.in_(old_batch_ids)
        ).delete(synchronize_session=False)
        db.flush()

    pending: dict[tuple[str, str], ReplyMonitorBatch] = {}
    processed: list[ReplyMonitorEvent] = []
    created = answered = ambiguous = 0
    for event, proposal in zip(events, preview_items):
        event.sender_kind = proposal["new_sender_kind"]
        metadata = dict(event.event_metadata or {})
        metadata.update({
            "problem_score": proposal["new_problem_score"],
            "problem_threshold": 50,
            "problem_rule_version": RULE_VERSION,
            "problem_reasons": proposal["problem_reasons"],
            "historically_rebuilt": True,
        })
        event.event_metadata = metadata
        event.normalized_content = _normalized(event.current_content or event.content_summary or "")
        event.problem_rule_version = RULE_VERSION
        event.problem_reasons = proposal["problem_reasons"]
        event.reply_match_status = "not_applicable"
        event.reply_actor_kind = None
        event.batch_id = None
        if event.sender_kind in {"unknown", "system"}:
            processed.append(event)
            continue
        conversation = (str(event.platform_id), event.conversation_key)
        conversation_batches = [
            batch for (conv_key, _), batch in pending.items()
            if conv_key == f"{conversation[0]}:{conversation[1]}"
        ]
        if event.sender_kind == "customer":
            identity = monitor.customer_identity_key(
                event.sender_id, event.sender_name, event.conversation_key
            )
            pending_key = (f"{conversation[0]}:{conversation[1]}", identity)
            batch = pending.get(pending_key)
            if batch is not None and monitor.is_customer_resolution_text(
                event.current_content or event.content_summary
            ):
                batch.status = "answered"
                batch.first_reply_at = event.occurred_at
                batch.next_reminder_at = None
                batch.actual_reply_name = event.sender_name
                batch.reply_actor_kind = "customer_self"
                batch.reply_match_status = "matched_self_resolution"
                batch.review_required = False
                event.batch_id = batch.id
                event.reply_actor_kind = "customer_self"
                event.reply_match_status = "matched_self_resolution"
                pending.pop(pending_key, None)
                answered += 1
                processed.append(event)
                continue
            quoted = [row for row in processed if monitor.quoted_event_matches(
                row, event.quoted_sender_id, event.quoted_sender_name, event.quoted_content
            )] if (event.quoted_sender_id or event.quoted_sender_name) else []
            peer_batch, peer_status = monitor.select_reply_batch(conversation_batches, quoted)
            if (
                peer_batch is not None
                and peer_batch.customer_identity_key != identity
                and int(proposal["new_problem_score"]) < 30
            ):
                peer_batch.status = "answered"
                peer_batch.first_reply_at = event.occurred_at
                peer_batch.next_reminder_at = None
                peer_batch.actual_reply_name = event.sender_name
                peer_batch.reply_actor_kind = "customer_peer"
                peer_batch.reply_match_status = peer_status
                peer_batch.review_required = False
                event.batch_id = peer_batch.id
                event.reply_actor_kind = "customer_peer"
                event.reply_match_status = peer_status
                pending.pop((f"{conversation[0]}:{conversation[1]}", peer_batch.customer_identity_key), None)
                answered += 1
                processed.append(event)
                continue
            if batch:
                batch.last_customer_at = event.occurred_at
                batch.customer_message_count += 1
                event.batch_id = batch.id
            else:
                score = int(proposal["new_problem_score"])
                recent = [row for row in processed if (
                    row.conversation_key == event.conversation_key
                    and event.occurred_at - row.occurred_at <= monitor.PROBLEM_ESCALATION_WINDOW
                    and (
                        row.sender_kind == "staff"
                        or (
                            row.sender_kind == "customer"
                            and monitor.customer_identity_key(
                                row.sender_id, row.sender_name, row.conversation_key
                            ) == identity
                        )
                    )
                )]
                if score >= 50 or (score >= 30 and monitor.has_problem_escalation_context(recent, identity, event.occurred_at)):
                    owner = monitor._responsible_staff_id(
                        db, platform, event.conversation_type, event.conversation_key, metadata
                    )
                    batch = ReplyMonitorBatch(
                        project_id=platform.project_id, platform_id=platform.id,
                        conversation_key=event.conversation_key,
                        conversation_type=event.conversation_type,
                        conversation_name=event.conversation_name,
                        channel_open_id=event.channel_open_id,
                        customer_identity_key=identity,
                        customer_sender_id=event.sender_id,
                        customer_sender_name=event.sender_name,
                        responsible_staff_id=owner,
                        is_problem_candidate=True,
                        first_customer_at=event.occurred_at,
                        last_customer_at=event.occurred_at,
                        customer_message_count=1,
                        next_reminder_at=None,
                        review_required=True,
                    )
                    db.add(batch); db.flush()
                    pending[pending_key] = batch
                    event.batch_id = batch.id
                    created += 1
        elif event.sender_kind == "staff":
            quoted = [row for row in processed if monitor.quoted_event_matches(
                row, event.quoted_sender_id, event.quoted_sender_name, event.quoted_content
            )] if (event.quoted_sender_id or event.quoted_sender_name) else []
            batch, match_status = monitor.select_reply_batch(
                conversation_batches,
                quoted,
                allow_unquoted_single=is_substantive_staff_reply(
                    event.current_content or event.content_summary,
                    event.message_type,
                ),
            )
            event.reply_match_status = match_status
            if batch:
                batch.status = "answered"
                batch.first_reply_at = event.occurred_at
                batch.next_reminder_at = None
                batch.actual_reply_staff_id = event.resolved_staff_id
                batch.actual_reply_name = event.sender_name
                batch.reply_actor_kind = "staff"
                batch.reply_match_status = match_status
                batch.review_required = False
                event.batch_id = batch.id
                event.reply_actor_kind = "staff"
                pending.pop((f"{conversation[0]}:{conversation[1]}", batch.customer_identity_key), None)
                answered += 1
            elif match_status == "ambiguous":
                for batch in conversation_batches:
                    batch.review_required = True
                    batch.reply_match_status = "ambiguous"
                ambiguous += 1
        processed.append(event)
    # SessionLocal intentionally disables autoflush. Persist the final batch
    # transition so transaction-local validation cannot observe stale pending rows.
    db.flush()
    return {
        "events": len(events), "deleted_batches": len(old_batches),
        "created_batches": created, "answered_batches": answered,
        "ambiguous_replies": ambiguous,
    }
