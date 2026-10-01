"""Retention and irreversible redaction for reply-monitor customer data."""

from __future__ import annotations

from datetime import datetime


TERMINAL_TICKET_STATUSES = {"replied", "archived"}
SAFE_EVENT_METADATA_KEYS = {
    "problem_score",
    "problem_threshold",
    "problem_candidate",
    "message_type",
}


def retention_action_allowed(
    batch_status: str,
    ticket_status: str | None,
    terminal_at: datetime | None,
    cutoff: datetime,
) -> bool:
    if batch_status == "pending" or ticket_status == "pending_reply":
        return False
    if ticket_status is not None and ticket_status not in TERMINAL_TICKET_STATUSES:
        return False
    return bool(terminal_at and terminal_at < cutoff)


def redact_event(event) -> None:
    metadata = event.event_metadata or {}
    event.content_summary = "[已按数据保留策略删除]"
    event.sender_name = None
    event.sender_id = None
    event.event_metadata = {
        key: value for key, value in metadata.items() if key in SAFE_EVENT_METADATA_KEYS
    }
    event.event_metadata["retention_redacted"] = True
