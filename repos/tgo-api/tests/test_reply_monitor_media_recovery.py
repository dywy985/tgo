from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.services.reply_monitor_recovery_service import (
    build_recovery_targets,
    recovery_capture_source,
    recovery_result_message,
)


def _event(message_id: str, message_type: str, minute: int, sender: str = "客户甲"):
    return SimpleNamespace(
        id=uuid4(),
        message_id=message_id,
        message_type=message_type,
        conversation_key="wt:phone-1:售后群",
        conversation_name="售后群",
        sender_name=sender,
        content_summary="[图片]" if message_type == "image" else "打印机不能用",
        occurred_at=datetime(2026, 9, 4, 6, minute, tzinfo=timezone.utc),
        robot_id="phone-1",
    )


def test_recovery_preview_only_targets_images_without_existing_media():
    first = _event("image-1", "image", 35)
    second = _event("image-2", "image", 38)
    events = [_event("text-before", "text", 34), first, second, _event("text-after", "text", 39)]

    targets = build_recovery_targets(events, media_message_ids={"image-2"})

    assert [item.message_id for item in targets] == ["image-1"]
    assert targets[0].previous_text == "打印机不能用"
    assert targets[0].next_text == "打印机不能用"
    assert targets[0].occurred_at.tzinfo is not None
    assert targets[0].robot_id == "phone-1"


def test_recovery_capture_sources_are_separate_from_live_capture():
    assert recovery_capture_source(original_cache_found=True) == "recovered_cache"
    assert recovery_capture_source(original_cache_found=False) == "recovered_screen_crop"


def test_completed_recovery_explains_when_no_candidate_was_found():
    assert recovery_result_message("completed", 0) == (
        "恢复任务已完成，但未找到可唯一匹配的历史图片。"
        "原图可能已被清理，或手机未能定位到对应消息。"
    )


def test_completed_recovery_reports_candidate_count():
    assert recovery_result_message("completed", 2) == "已生成 2 张待人工确认的候选图片。"
    assert recovery_result_message("running", 0) is None
