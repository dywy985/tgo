from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.reply_monitor import DEFAULT_WEEKLY_SCHEDULE
from app.schemas.reply_monitor import ReplyMonitorSettingsUpdate
from app.tasks.reply_monitor_reminders import (
    build_wecom_digest_content,
    digest_idempotency_key,
    digest_window_start,
    split_digest_items,
)


def _item(name: str, minutes: int, sequence: int = 1):
    return SimpleNamespace(
        batch_id=uuid4(),
        conversation_name=name,
        conversation_key=f"key-{name}",
        pending_working_minutes=minutes,
        customer_message_count=2,
        latest_customer_summary="请问什么时候可以处理？",
        ticket_number="TK-20260903-0001",
        sequence=sequence,
        max_reminders=3,
        responsible_staff_name="陈泓森",
    )


def test_digest_settings_default_to_five_minutes_and_ten_items():
    settings = ReplyMonitorSettingsUpdate(
        weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
        notification_channels={"wecom_app": True},
    )
    assert settings.wecom_digest_minutes == 5
    assert settings.wecom_digest_max_items == 10


@pytest.mark.parametrize("minutes", [0, 31])
def test_digest_window_rejects_out_of_range_values(minutes):
    with pytest.raises(ValidationError):
        ReplyMonitorSettingsUpdate(
            weekly_schedule=DEFAULT_WEEKLY_SCHEDULE,
            notification_channels={"wecom_app": True},
            wecom_digest_minutes=minutes,
        )


def test_digest_window_is_stable_for_the_same_five_minute_bucket():
    assert digest_window_start(datetime(2026, 9, 3, 2, 7, tzinfo=timezone.utc), 5) == datetime(
        2026, 9, 3, 2, 5, tzinfo=timezone.utc
    )


def test_digest_items_are_split_without_loss():
    items = [_item(f"群{i}", i) for i in range(21)]
    chunks = split_digest_items(items, 10)
    assert [len(chunk) for chunk in chunks] == [10, 10, 1]
    assert [item for chunk in chunks for item in chunk] == items


def test_digest_message_is_actionable_and_orders_final_reminders_first():
    content = build_wecom_digest_content(
        [_item("普通群", 80, 1), _item("最终群", 70, 3)],
        recipient_name="陈泓森",
        chunk_index=1,
        chunk_total=1,
        unassigned=False,
    )
    assert content.index("最终群") < content.index("普通群")
    assert "2 个群聊待回复" in content
    assert "最长等待 80 分钟" in content
    assert "最后一次提醒" in content
    assert "请优先处理等待最久及最后提醒项" in content


def test_unassigned_digest_is_marked_for_admin_claiming():
    content = build_wecom_digest_content(
        [_item("无人群", 40)], "管理员", 1, 1, unassigned=True
    )
    assert "待认领" in content
    assert "未分配" in content


def test_digest_idempotency_key_is_stable_for_the_same_delivery_window():
    project_id = uuid4()
    staff_id = uuid4()
    window = datetime(2026, 9, 3, 2, 5, tzinfo=timezone.utc)

    delivery_ids = [uuid4(), uuid4()]
    first = digest_idempotency_key(project_id, staff_id, window, False, 2, delivery_ids)
    second = digest_idempotency_key(project_id, staff_id, window, False, 2, list(reversed(delivery_ids)))

    assert first == second
    assert ":owner:2:" in first
