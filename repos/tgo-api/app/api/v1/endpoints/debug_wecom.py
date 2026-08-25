"""企微通道调试端点 (v2.0).

供 tgo-web 设置页"企微调试"面板使用:
  GET  /debug/wecom/sessions            群聊会话列表 (读 pt_wecom_inbox 按 from_uid 分组)
  GET  /debug/wecom/messages?conv=&n=   某会话消息记录
  POST /debug/wecom/send/worktool       WorkTool 通道发送 (代理 bridge 网关 8790)
  POST /debug/wecom/send/aibot          aibot 通道发送 (代理 bridge 发送服务 8791)

数据源: pt_wecom_inbox (tgo-platform 的 inbox 表, 同库跨表读)。
bridge 地址: settings.wecom_debug_bridge_url (env WECOM_DEBUG_BRIDGE_URL, 默认 http://172.26.192.1 本机开发)。
"""
from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import get_current_active_user
from app.models import Staff

logger = get_logger("endpoints.debug_wecom")
router = APIRouter()

BRIDGE_HOST = os.environ.get("WECOM_DEBUG_BRIDGE_URL", "http://172.26.192.1")
WORKTOOL_GATEWAY = os.environ.get("WECOM_DEBUG_WORKTOOL_URL", BRIDGE_HOST + ":8790")
AIBOT_SENDER = os.environ.get("WECOM_DEBUG_AIBOT_URL", BRIDGE_HOST + ":8791")


@router.get("/wecom/sessions")
async def wecom_sessions(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """群聊会话列表: from_uid + conv_name + 消息数 + 最后消息。"""
    rows = db.execute(
        text("""
            SELECT from_user,
                   COALESCE(NULLIF(raw_payload->>'conv_name', ''), from_user) AS conv_name,
                   COUNT(*) AS msg_count,
                   MAX(fetched_at) AS last_at
            FROM pt_wecom_inbox
            WHERE source_type IN ('wecom_reader', 'worktool')
              AND from_user <> ''
            GROUP BY from_user, conv_name
            ORDER BY last_at DESC
            LIMIT 100
        """)
    ).mappings().all()
    return {"count": len(rows), "sessions": [dict(r) for r in rows]}


@router.get("/wecom/messages")
async def wecom_messages(
    conv: str,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """某会话消息记录 (按时间倒序取最近 limit 条, 返回正序)。"""
    if not conv or len(conv) > 128:
        raise HTTPException(status_code=400, detail="conv 参数无效")
    limit = min(max(limit, 1), 1000)
    rows = db.execute(
        text("""
            SELECT id, from_user, content,
                   raw_payload->>'sender_name' AS sender_name,
                   source_type,
                   (raw_payload->>'is_question')::boolean AS is_question,
                   is_from_colleague,
                   raw_payload->>'conv_name' AS conv_name,
                   fetched_at, ai_reply
            FROM pt_wecom_inbox
            WHERE from_user = :conv
            ORDER BY fetched_at DESC
            LIMIT :limit
        """),
        {"conv": conv, "limit": limit},
    ).mappings().all()
    msgs = [dict(r) for r in reversed(rows)]
    return {"count": len(msgs), "messages": msgs}


async def _proxy_send(base_url: str, payload: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(base_url + "/api/send", json=payload)
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {"raw": resp.text}
            return {"ok": resp.status_code == 200, "bridge_status": resp.status_code, "data": data}
    except Exception as e:
        return {"ok": False, "error": f"bridge 不可达: {e}"}


@router.post("/wecom/send/worktool")
async def wecom_send_worktool(
    payload: dict[str, Any],
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """WorkTool 通道发送 (title=群名, robot_id 可空用平台配置)。"""
    title = str(payload.get("title") or "").strip()
    content = str(payload.get("content") or "").strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="title(群名) 和 content 必填")
    return await _proxy_send(WORKTOOL_GATEWAY, {
        "robot_id": str(payload.get("robot_id") or "").strip(),
        "title": title,
        "content": content,
    })


@router.post("/wecom/send/aibot")
async def wecom_send_aibot(
    payload: dict[str, Any],
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """aibot 通道发送 (chatid=wr_xxx)。"""
    chatid = str(payload.get("chatid") or "").strip()
    content = str(payload.get("content") or "").strip()
    if not chatid or not content:
        raise HTTPException(status_code=400, detail="chatid 和 content 必填")
    return await _proxy_send(AIBOT_SENDER, {
        "chatid": chatid,
        "content": content,
        "msgtype": str(payload.get("msgtype") or "markdown"),
    })
