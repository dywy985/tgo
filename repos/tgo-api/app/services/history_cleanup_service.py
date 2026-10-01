from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


DEFAULT_CUTOFF_UTC = datetime(2026, 9, 3, 16, 0, tzinfo=timezone.utc)


def parse_cleanup_cutoff(value: str) -> datetime:
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("cleanup cutoff must include a timezone")
    return parsed.astimezone(timezone.utc)


def cleanup_fingerprint(
    project_id: str,
    cutoff: datetime,
    counts: dict[str, int],
    target_ids: list[str],
) -> str:
    payload = {
        "project_id": str(project_id),
        "cutoff": cutoff.astimezone(timezone.utc).isoformat(),
        "counts": dict(sorted(counts.items())),
        "target_ids": sorted(str(item) for item in target_ids),
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def hash_cleanup_token(token: str, fingerprint: str) -> str:
    return hmac.new(
        fingerprint.encode(), str(token).encode(), hashlib.sha256
    ).hexdigest()


def verify_cleanup_token(token: str, fingerprint: str, expected_digest: str) -> bool:
    return hmac.compare_digest(
        hash_cleanup_token(token, fingerprint), expected_digest
    )


def _scalar(db: Session, sql: str, params: dict[str, Any]) -> int:
    return int(db.execute(text(sql), params).scalar() or 0)


def history_cleanup_preview(db: Session, project_id: str, cutoff: datetime) -> dict[str, Any]:
    params = {"project_id": str(project_id), "cutoff": cutoff}
    ticket_where = "project_id=:project_id AND created_at < :cutoff"
    counts = {
        "tickets": _scalar(db, f"SELECT count(*) FROM api_tickets WHERE {ticket_where}", params),
        "ticket_comments": _scalar(db, f"SELECT count(*) FROM api_ticket_comments WHERE ticket_id IN (SELECT id FROM api_tickets WHERE {ticket_where})", params),
        "ticket_attachments": _scalar(db, f"SELECT count(*) FROM api_ticket_attachments WHERE ticket_id IN (SELECT id FROM api_tickets WHERE {ticket_where})", params),
        "ticket_status_history": _scalar(db, f"SELECT count(*) FROM api_ticket_status_history WHERE ticket_id IN (SELECT id FROM api_tickets WHERE {ticket_where})", params),
        "monitor_events": _scalar(db, "SELECT count(*) FROM api_reply_monitor_events WHERE project_id=:project_id AND occurred_at < :cutoff", params),
        "monitor_batches": _scalar(db, "SELECT count(*) FROM api_reply_monitor_batches b WHERE b.project_id=:project_id AND b.first_customer_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_reply_monitor_events e WHERE e.batch_id=b.id AND e.occurred_at >= :cutoff)", params),
        "monitor_media": _scalar(db, "SELECT count(*) FROM api_reply_monitor_media WHERE project_id=:project_id AND created_at < :cutoff", params),
        "monitor_reminders": _scalar(db, "SELECT count(*) FROM api_reply_monitor_reminders r WHERE r.created_at < :cutoff AND r.batch_id IN (SELECT id FROM api_reply_monitor_batches WHERE project_id=:project_id)", params),
        "debug_inbox": _scalar(db, "SELECT count(*) FROM pt_wecom_inbox WHERE fetched_at < :cutoff AND platform_id IN (SELECT id FROM pt_platforms WHERE project_id=:project_id)", params),
        "chat_files": _scalar(db, "SELECT count(*) FROM api_chat_files WHERE project_id=:project_id AND created_at < :cutoff", params),
        "visitor_sessions": _scalar(db, "SELECT count(*) FROM api_visitor_sessions s WHERE s.project_id=:project_id AND s.created_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_tickets t WHERE t.session_id=s.id AND t.created_at >= :cutoff)", params),
        "orphan_visitors": _scalar(db, "SELECT count(*) FROM api_visitors v WHERE v.project_id=:project_id AND v.created_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_tickets t WHERE t.visitor_id=v.id AND t.created_at >= :cutoff) AND NOT EXISTS (SELECT 1 FROM api_visitor_sessions s WHERE s.visitor_id=v.id AND (s.created_at >= :cutoff OR EXISTS (SELECT 1 FROM api_tickets t WHERE t.session_id=s.id AND t.created_at >= :cutoff)))", params),
    }
    target_rows = db.execute(text(
        "SELECT 'ticket:' || id::text FROM api_tickets WHERE project_id=:project_id AND created_at < :cutoff "
        "UNION ALL SELECT 'event:' || id::text FROM api_reply_monitor_events WHERE project_id=:project_id AND occurred_at < :cutoff "
        "UNION ALL SELECT 'batch:' || b.id::text FROM api_reply_monitor_batches b WHERE b.project_id=:project_id AND b.first_customer_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_reply_monitor_events e WHERE e.batch_id=b.id AND e.occurred_at >= :cutoff) "
        "UNION ALL SELECT 'media:' || id::text FROM api_reply_monitor_media WHERE project_id=:project_id AND created_at < :cutoff "
        "UNION ALL SELECT 'inbox:' || id::text FROM pt_wecom_inbox WHERE fetched_at < :cutoff AND platform_id IN (SELECT id FROM pt_platforms WHERE project_id=:project_id) "
        "UNION ALL SELECT 'visitor:' || v.id::text FROM api_visitors v WHERE v.project_id=:project_id AND v.created_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_tickets t WHERE t.visitor_id=v.id AND t.created_at >= :cutoff) AND NOT EXISTS (SELECT 1 FROM api_visitor_sessions s WHERE s.visitor_id=v.id AND (s.created_at >= :cutoff OR EXISTS (SELECT 1 FROM api_tickets t WHERE t.session_id=s.id AND t.created_at >= :cutoff)))"
    ), params).all()
    target_ids = [str(row[0]) for row in target_rows]
    return {
        "cutoff_utc": cutoff.astimezone(timezone.utc).isoformat(),
        "counts": counts,
        "target_ids": target_ids,
        "target_id_summary": target_ids[:100],
        "fingerprint": cleanup_fingerprint(str(project_id), cutoff, counts, target_ids),
    }


def delete_history_before(db: Session, project_id: str, cutoff: datetime) -> dict[str, Any]:
    """Delete one project's pre-cutoff business data inside the caller's transaction."""
    params = {"project_id": str(project_id), "cutoff": cutoff}
    ticket_where = "project_id=:project_id AND created_at < :cutoff"
    attachment_paths = [str(row[0]) for row in db.execute(text(
        f"SELECT storage_path FROM api_ticket_attachments WHERE ticket_id IN (SELECT id FROM api_tickets WHERE {ticket_where})"
    ), params).all() if row[0]]
    media_paths = [str(row[0]) for row in db.execute(text(
        "SELECT storage_path FROM api_reply_monitor_media WHERE project_id=:project_id AND created_at < :cutoff"
    ), params).all() if row[0]]
    chat_paths = [str(row[0]) for row in db.execute(text(
        "SELECT file_path FROM api_chat_files WHERE project_id=:project_id AND created_at < :cutoff"
    ), params).all() if row[0]]

    deleted: dict[str, int] = {}
    statements = [
        ("monitor_reminders", "DELETE FROM api_reply_monitor_reminders r WHERE r.created_at < :cutoff AND r.batch_id IN (SELECT id FROM api_reply_monitor_batches WHERE project_id=:project_id)"),
        ("monitor_media", "DELETE FROM api_reply_monitor_media WHERE project_id=:project_id AND created_at < :cutoff"),
        ("monitor_events", "DELETE FROM api_reply_monitor_events WHERE project_id=:project_id AND occurred_at < :cutoff"),
        ("monitor_batches", "DELETE FROM api_reply_monitor_batches b WHERE b.project_id=:project_id AND b.first_customer_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_reply_monitor_events e WHERE e.batch_id=b.id AND e.occurred_at >= :cutoff)"),
        ("monitor_digests", "DELETE FROM api_reply_monitor_digests d WHERE d.project_id=:project_id AND d.created_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_reply_monitor_reminders r WHERE r.digest_id=d.id)"),
        ("tickets", f"DELETE FROM api_tickets WHERE {ticket_where}"),
        ("debug_inbox", "DELETE FROM pt_wecom_inbox WHERE fetched_at < :cutoff AND platform_id IN (SELECT id FROM pt_platforms WHERE project_id=:project_id)"),
        ("chat_files", "DELETE FROM api_chat_files WHERE project_id=:project_id AND created_at < :cutoff"),
        ("assignment_history", "DELETE FROM api_visitor_assignment_history WHERE project_id=:project_id AND created_at < :cutoff"),
        ("visitor_sessions", "DELETE FROM api_visitor_sessions s WHERE s.project_id=:project_id AND s.created_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_tickets t WHERE t.session_id=s.id AND t.created_at >= :cutoff)"),
        ("orphan_visitors", "DELETE FROM api_visitors v WHERE v.project_id=:project_id AND v.created_at < :cutoff AND NOT EXISTS (SELECT 1 FROM api_tickets t WHERE t.visitor_id=v.id) AND NOT EXISTS (SELECT 1 FROM api_visitor_sessions s WHERE s.visitor_id=v.id)"),
    ]
    for name, sql in statements:
        deleted[name] = int(db.execute(text(sql), params).rowcount or 0)
    return {"deleted": deleted, "storage_paths": sorted(set(attachment_paths + media_paths + chat_paths))}
