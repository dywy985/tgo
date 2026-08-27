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
import json

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


DEFAULT_TRIGGER = {
    "mode": "hybrid",
    "score_threshold": 60,
    "llm_prefilter": False,
    "ignore_members": [],
}


# ---------- aibot 长连接配置 (代理到 Windows 侧发送服务) ----------

async def _aibot_http(method: str, path: str, payload: dict | None = None):
    async with httpx.AsyncClient(timeout=30) as client:
        if method == "GET":
            resp = await client.get(AIBOT_SENDER + path)
        else:
            resp = await client.post(AIBOT_SENDER + path, json=payload)
        try:
            return resp.json(), resp.status_code
        except Exception:
            return {"ok": False, "error": "bridge 返回非 JSON"}, resp.status_code


@router.get("/wecom/aibot-config")
async def wecom_aibot_config_get(
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    data, code = await _aibot_http("GET", "/api/config")
    if code >= 400:
        raise HTTPException(status_code=code, detail=data.get("error") or data)
    return data


@router.put("/wecom/aibot-config")
async def wecom_aibot_config_put(
    payload: dict[str, Any],
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    data, code = await _aibot_http("POST", "/api/config", payload)
    if code >= 400:
        raise HTTPException(status_code=code, detail=data.get("error") or data)
    return data


# ---------- worktool 通道配置 (存平台 config) ----------

@router.get("/wecom/worktool-config")
async def wecom_worktool_config_get(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    row = db.execute(
        text("SELECT config FROM pt_platforms WHERE type = 'worktool' AND is_active = true ORDER BY created_at LIMIT 1")
    ).mappings().first()
    cfg = dict(row["config"] or {}) if row else {}
    return {"worktool": {
        "robot_id": cfg.get("robot_id") or "",
        "gateway_url": cfg.get("gateway_url") or "",
    }}


@router.put("/wecom/worktool-config")
async def wecom_worktool_config_put(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    wt = payload.get("worktool", payload)
    robot_id = str(wt.get("robot_id") or "").strip()
    gateway_url = str(wt.get("gateway_url") or "").strip()
    if not robot_id:
        raise HTTPException(status_code=400, detail="robot_id 不能为空")
    for table in ("pt_platforms", "api_platforms"):
        db.execute(
            text(f"UPDATE {table} SET config = jsonb_set(jsonb_set(COALESCE(config, '{{}}'::jsonb), '{{robot_id}}', to_jsonb(:rid::text)), '{{gateway_url}}', to_jsonb(:gurl::text)) WHERE type = 'worktool' AND is_active = true"),
            {"rid": robot_id, "gurl": gateway_url},
        )
    db.commit()
    return {"ok": True, "worktool": {"robot_id": robot_id, "gateway_url": gateway_url}}


@router.get("/wecom/aibot-messages")
async def wecom_aibot_messages_get(
    n: int = 50,
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """机器人长连接收到的消息 (调试): 代理到 Windows 发送服务 /api/messages"""
    data, code = await _aibot_http("GET", "/api/messages?n=%d" % max(1, min(n, 500)))
    if code >= 400:
        raise HTTPException(status_code=code, detail=data.get("error") or data)
    return data


@router.get("/wecom/trigger")
async def wecom_trigger_get(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """读企微通道触发配置 (存于 pt_platforms.config.trigger)。"""
    row = db.execute(
        text("SELECT config FROM pt_platforms WHERE type = 'wecom_reader' AND is_active = true ORDER BY created_at LIMIT 1")
    ).mappings().first()
    cfg = dict(row["config"] or {}) if row else {}
    trigger = dict(cfg.get("trigger") or {})
    merged = {**DEFAULT_TRIGGER, **trigger}
    return {"trigger": merged}


@router.put("/wecom/trigger")
async def wecom_trigger_put(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """写企微通道触发配置 (更新 pt_platforms + api_platforms 双表 config.trigger)。"""
    trigger = {**DEFAULT_TRIGGER, **payload.get("trigger", {})}
    # 校验字段
    if trigger["mode"] not in ("hybrid", "mention", "auto", "disabled"):
        raise HTTPException(status_code=400, detail="mode 必须是 hybrid/mention/auto/disabled")
    try:
        trigger["score_threshold"] = max(1, min(int(trigger["score_threshold"]), 100))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="score_threshold 必须是 1-100 整数")
    trigger["llm_prefilter"] = bool(trigger["llm_prefilter"])
    trigger["ignore_members"] = [str(x).strip() for x in trigger.get("ignore_members", []) if str(x).strip()]

    # 双表更新: pt_platforms (tgo-platform 消费) + api_platforms (后台展示)
    for table in ("pt_platforms", "api_platforms"):
        db.execute(
            text(f"UPDATE {table} SET config = jsonb_set(COALESCE(config, '{{}}'::jsonb), '{{trigger}}', CAST(:trigger AS jsonb)) WHERE type = 'wecom_reader' AND is_active = true"),
            {"trigger": json.dumps(trigger, ensure_ascii=False)},
        )
    db.commit()
    return {"ok": True, "trigger": trigger}


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
