"""Pure planning helpers for administrator-controlled media recovery jobs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import io
from typing import Iterable, Optional, Sequence
from uuid import UUID
from uuid import uuid4

from app.services.reply_monitor_media_service import sanitize_image
from app.services.storage import get_storage


@dataclass(frozen=True)
class RecoveryTarget:
    event_id: UUID
    message_id: str
    conversation_key: str
    conversation_name: str
    sender_name: str
    occurred_at: datetime
    previous_text: Optional[str]
    next_text: Optional[str]
    robot_id: str


def _is_image(event) -> bool:
    return str(getattr(event, "message_type", "")).strip().casefold() == "image"


def _text_context(event) -> Optional[str]:
    if _is_image(event):
        return None
    value = str(getattr(event, "content_summary", "") or "").strip()
    return value or None


def build_recovery_targets(
    events: Sequence,
    *,
    media_message_ids: Iterable[str],
) -> list[RecoveryTarget]:
    """List retained image events whose original media is not stored."""
    existing = {str(item) for item in media_message_ids}
    targets: list[RecoveryTarget] = []
    for index, event in enumerate(events):
        message_id = str(getattr(event, "message_id", "") or "")
        if not _is_image(event) or not message_id or message_id in existing:
            continue
        previous_text = next(
            (_text_context(item) for item in reversed(events[:index]) if _text_context(item)),
            None,
        )
        next_text = next(
            (_text_context(item) for item in events[index + 1 :] if _text_context(item)),
            None,
        )
        targets.append(
            RecoveryTarget(
                event_id=event.id,
                message_id=message_id,
                conversation_key=event.conversation_key,
                conversation_name=event.conversation_name,
                sender_name=event.sender_name,
                occurred_at=event.occurred_at,
                previous_text=previous_text,
                next_text=next_text,
                robot_id=str(getattr(event, "robot_id", "") or ""),
            )
        )
    return targets


def recovery_capture_source(*, original_cache_found: bool) -> str:
    return "recovered_cache" if original_cache_found else "recovered_screen_crop"


def recovery_result_message(status: str, candidate_count: int) -> Optional[str]:
    """Describe a terminal recovery outcome without overstating the root cause."""
    if status != "completed":
        return None
    if candidate_count <= 0:
        return (
            "恢复任务已完成，但未找到可唯一匹配的历史图片。"
            "原图可能已被清理，或手机未能定位到对应消息。"
        )
    return f"已生成 {candidate_count} 张待人工确认的候选图片。"


async def store_recovery_candidate(
    db, job, event, content: bytes, content_type: str, filename: str,
    capture_source: str, evidence: Optional[dict] = None,
):
    """Sanitize and quarantine bytes without associating them as real event media."""
    from app.models.reply_monitor import ReplyMonitorMediaRecoveryCandidate

    if capture_source not in {"recovered_cache", "recovered_screen_crop"}:
        raise ValueError("恢复候选来源无效")
    image = sanitize_image(
        content, content_type, filename,
        crop_screen_preview=capture_source == "recovered_screen_crop",
    )
    existing = db.query(ReplyMonitorMediaRecoveryCandidate).filter(
        ReplyMonitorMediaRecoveryCandidate.job_id == job.id,
        ReplyMonitorMediaRecoveryCandidate.event_id == event.id,
        ReplyMonitorMediaRecoveryCandidate.sha256 == image.sha256,
    ).first()
    if existing:
        return existing, True
    path = f"reply-monitor-recovery/{job.project_id}/{job.id}/{uuid4().hex}-{image.filename}"
    storage = get_storage()
    await storage.upload(io.BytesIO(image.content), path, image.content_type)
    candidate = ReplyMonitorMediaRecoveryCandidate(
        project_id=job.project_id, job_id=job.id, event_id=event.id,
        message_id=event.message_id, storage_path=path, original_name=image.filename,
        content_type=image.content_type, file_size=len(image.content), sha256=image.sha256,
        width=image.width, height=image.height, capture_source=capture_source,
        status="pending", evidence=evidence or {},
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate, False
