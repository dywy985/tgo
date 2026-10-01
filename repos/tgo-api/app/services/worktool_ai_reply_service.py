"""Narrowly-scoped AI replies for the explicitly allowed WorkTool test group."""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import re
import unicodedata
from typing import Any, Awaitable, Callable, Iterable

import httpx

from app.core.database import SessionLocal
from app.models.platform import Platform
from app.models.reply_monitor import ReplyMonitorEvent
from app.services.ai_client import ai_client as default_ai_client

logger = logging.getLogger(__name__)


TEXT_MESSAGE_TYPES = {"text", "1"}
NON_CONTENT_PLACEHOLDERS = {"[图片]", "【图片】", "[视频]", "【视频】", "[文件]", "【文件】"}


def normalize_group_name(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    return re.sub(r"\s+", " ", normalized).strip()


def parse_allowed_groups(raw: str | None) -> set[str]:
    return {
        group
        for item in (raw or "").split(",")
        if (group := normalize_group_name(item))
    }


def should_auto_reply(
    *,
    conversation_name: str | None,
    sender_kind: str | None,
    message_type: str | int | None,
    content: str | None,
    duplicate: bool,
    ignored: bool,
    has_pending_batch: bool,
    allowed_groups: Iterable[str],
) -> bool:
    allowed = {normalize_group_name(group) for group in allowed_groups}
    normalized_content = (content or "").strip()
    return bool(
        normalize_group_name(conversation_name) in allowed
        and (sender_kind or "").lower() == "customer"
        and str(message_type or "").lower() in TEXT_MESSAGE_TYPES
        and normalized_content
        and normalized_content not in NON_CONTENT_PLACEHOLDERS
        and not duplicate
        and not ignored
        and has_pending_batch
    )


def _extract_ai_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        for item in value:
            text = _extract_ai_text(item)
            if text:
                return text
        return ""
    if not isinstance(value, dict):
        return ""
    for key in ("content", "text", "answer"):
        text = _extract_ai_text(value.get(key))
        if text:
            return text
    for key in ("message", "result", "data", "choices"):
        text = _extract_ai_text(value.get(key))
        if text:
            return text
    return ""


async def send_worktool_text(
    *,
    gateway_url: str,
    control_token: str,
    robot_id: str,
    title: str,
    content: str,
    idempotency_key: str,
) -> dict[str, Any]:
    if not gateway_url or not control_token:
        return {"status": "config_missing"}
    headers = {"X-API-Key": control_token}
    payload = {
        "robot_id": robot_id,
        "title": title,
        "content": content,
        "idempotency_key": idempotency_key,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(f"{gateway_url.rstrip('/')}/api/send", json=payload, headers=headers)
        response.raise_for_status()
        result = response.json()
        send_id = result.get("send_id")
        if not send_id:
            return {"status": result.get("status", "queued")}
        for _ in range(40):
            status_response = await client.get(
                f"{gateway_url.rstrip('/')}/api/sends/{send_id}", headers=headers
            )
            status_response.raise_for_status()
            status = status_response.json()
            if status.get("status") in {"success", "failed", "expired", "cancelled"}:
                return status
            await asyncio.sleep(0.5)
        return {"status": "timeout", "send_id": send_id}


async def generate_and_send_reply(
    *,
    project_id: str,
    robot_id: str,
    conversation_name: str,
    sender_identity: str,
    message_id: str,
    content: str,
    ai_client: Any = default_ai_client,
    sender: Callable[..., Awaitable[dict[str, Any]]] = send_worktool_text,
    gateway_url: str = "",
    control_token: str = "",
) -> dict[str, Any]:
    ai_result = ai_client.run_supervisor_agent(
        message=content,
        project_id=str(project_id),
        user_id=sender_identity,
        session_id=f"worktool:{robot_id}:{normalize_group_name(conversation_name)}",
        stream=False,
    )
    if inspect.isawaitable(ai_result):
        ai_result = await ai_result
    reply = _extract_ai_text(ai_result)[:20000]
    if not reply:
        return {"status": "empty_ai_reply"}
    send_result = await sender(
        gateway_url=gateway_url,
        control_token=control_token,
        robot_id=robot_id,
        title=conversation_name,
        content=reply,
        idempotency_key=f"ai-reply:{message_id}",
    )
    return {**send_result, "reply": reply}


async def process_event_ai_reply(event_id: str, platform_id: str) -> None:
    """Background task; refetches state so request DB sessions are never reused."""
    db = SessionLocal()
    try:
        event = db.query(ReplyMonitorEvent).filter(ReplyMonitorEvent.id == event_id).first()
        platform = db.query(Platform).filter(Platform.id == platform_id).first()
        if not event or not platform:
            return
        if (
            os.getenv("WORKTOOL_AI_TEST_ENABLED", "false").lower() != "true"
            or not os.getenv("WORKTOOL_AI_TEST_ROBOT_ID")
            or event.robot_id != os.getenv("WORKTOOL_AI_TEST_ROBOT_ID")
            or event.conversation_type != "group"
            or not should_auto_reply(
                conversation_name=event.conversation_name,
                sender_kind=event.sender_kind,
                message_type=event.message_type,
                content=event.current_content,
                duplicate=False,
                ignored=False,
                has_pending_batch=bool(event.batch_id),
                allowed_groups=parse_allowed_groups(os.getenv("WORKTOOL_AI_TEST_GROUPS")),
            )
        ):
            return
        connection = platform.connection_active or {}
        config = platform.config or {}
        gateway_url = connection.get("gateway_url") or config.get("gateway_url") or ""
        control_token = os.getenv("WORKTOOL_CONTROL_TOKEN") or os.getenv("WECOM_DEBUG_WORKTOOL_API_KEY") or ""
        result = await generate_and_send_reply(
            project_id=str(event.project_id),
            robot_id=event.robot_id or "",
            conversation_name=event.conversation_name or "",
            sender_identity=event.sender_id or event.sender_name or "anonymous",
            message_id=event.message_id or str(event.id),
            content=event.current_content or "",
            gateway_url=gateway_url,
            control_token=control_token,
        )
        metadata = dict(event.event_metadata or {})
        metadata["ai_reply"] = {
            "status": result.get("status"),
            "send_id": result.get("send_id"),
            "reply_preview": (result.get("reply") or "")[:200],
        }
        event.event_metadata = metadata
        db.commit()
    except Exception as exc:  # pragma: no cover - defensive production boundary
        db.rollback()
        logger.exception("WorkTool AI test-group reply failed for event %s: %s", event_id, type(exc).__name__)
    finally:
        db.close()
