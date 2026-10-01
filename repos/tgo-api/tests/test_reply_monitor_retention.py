from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.reply_monitor_retention_service import (
    redact_event,
    retention_action_allowed,
)


def test_retention_never_cleans_pending_work():
    cutoff = datetime(2026, 3, 7, tzinfo=timezone.utc)
    old = datetime(2026, 3, 1, tzinfo=timezone.utc)

    assert retention_action_allowed("pending", None, old, cutoff) is False
    assert retention_action_allowed("replied", "pending_reply", old, cutoff) is False


def test_retention_cleans_terminal_or_replied_without_ticket_after_cutoff():
    cutoff = datetime(2026, 3, 7, tzinfo=timezone.utc)
    old = datetime(2026, 3, 1, tzinfo=timezone.utc)

    assert retention_action_allowed("replied", "archived", old, cutoff) is True
    assert retention_action_allowed("replied", "replied", old, cutoff) is True
    assert retention_action_allowed("replied", None, old, cutoff) is True
    assert retention_action_allowed("replied", "archived", cutoff, cutoff) is False


def test_event_redaction_keeps_statistics_but_removes_identity_and_content():
    event = SimpleNamespace(
        content_summary="联系电话 13800000000",
        sender_name="真实客户",
        sender_id="external-user-id",
        event_metadata={"problem_score": 70, "phone": "13800000000"},
    )

    redact_event(event)

    assert event.content_summary == "[已按数据保留策略删除]"
    assert event.sender_name is None
    assert event.sender_id is None
    assert event.event_metadata == {"problem_score": 70, "retention_redacted": True}
