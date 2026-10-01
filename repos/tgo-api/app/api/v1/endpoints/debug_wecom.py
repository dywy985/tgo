"""企微通道调试端点 (v2.0).

供 tgo-web 设置页"企微调试"面板使用:
  GET  /debug/wecom/sessions            群聊会话列表 (按项目、平台和精确群名分组)
  GET  /debug/wecom/messages?conv=&n=   某会话消息记录
  POST /debug/wecom/send/worktool       WorkTool 通道发送 (代理 bridge 网关 8790)
  POST /debug/wecom/send/aibot          aibot 通道发送 (代理 bridge 发送服务 8791)

数据源: pt_wecom_inbox (tgo-platform 的 inbox 表, 同库跨表读)。
bridge 地址: settings.wecom_debug_bridge_url (env WECOM_DEBUG_BRIDGE_URL, 默认 http://172.26.192.1 本机开发)。
"""
from __future__ import annotations

import json
import os
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import get_current_active_user
from app.models import ReplyMonitorMedia, Staff

logger = get_logger("endpoints.debug_wecom")
router = APIRouter()

BRIDGE_HOST = os.environ.get("WECOM_DEBUG_BRIDGE_URL", "http://172.26.192.1")
WORKTOOL_GATEWAY = os.environ.get("WECOM_DEBUG_WORKTOOL_URL", BRIDGE_HOST + ":8790")
AIBOT_SENDER = os.environ.get("WECOM_DEBUG_AIBOT_URL", BRIDGE_HOST + ":8791")


def _require_debug_admin(user: Staff) -> Staff:
    if str(getattr(user, "role", "")) != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可清理调试聊天记录")
    return user


def _project_inbox_where() -> str:
    return "platform_id IN (SELECT id FROM pt_platforms WHERE project_id=:project_id)"


def _make_conversation_key(platform_id: UUID | str, conversation_ref: str) -> str:
    """Build the stable debug-session key for one platform and exact group name."""
    return f"{platform_id}:{conversation_ref}"


def _parse_conversation_key(value: str) -> tuple[UUID, str] | None:
    """Parse a canonical key while leaving legacy from_user values untouched."""
    platform_part, separator, conversation_ref = value.partition(":")
    if not separator or not conversation_ref:
        return None
    try:
        platform_id = UUID(platform_part)
    except (TypeError, ValueError):
        return None
    return platform_id, conversation_ref


def _debug_media_items(media_rows: list[Any]) -> dict[str, list[dict[str, Any]]]:
    items: dict[str, list[dict[str, Any]]] = {}
    for media in media_rows:
        items.setdefault(str(media.message_id), []).append({
            "id": str(media.id),
            "content_type": media.content_type,
            "file_size": media.file_size,
            "width": media.width,
            "height": media.height,
            "status": media.status,
            "capture_source": getattr(media, "capture_source", "cache"),
            "url": f"/v1/reply-monitor/media/{media.id}",
        })
    return items


@router.get("/wecom/sessions")
async def wecom_sessions(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """群聊会话列表: 同一项目和平台内按精确群名归并。"""
    rows = db.execute(
        text("""
            WITH scoped AS (
                SELECT platform_id,
                       COALESCE(NULLIF(BTRIM(raw_payload->>'conv_name'), ''), from_user) AS conversation_ref,
                       fetched_at
                FROM pt_wecom_inbox
                WHERE source_type IN ('wecom_reader', 'worktool')
                  AND platform_id IN (SELECT id FROM pt_platforms WHERE project_id=:project_id)
                  AND from_user <> ''
            )
            SELECT platform_id,
                   conversation_ref,
                   conversation_ref AS conv_name,
                   COUNT(*) AS msg_count,
                   MAX(fetched_at) AS last_at
            FROM scoped
            GROUP BY platform_id, conversation_ref
            ORDER BY last_at DESC
            LIMIT 100
        """),
        {"project_id": str(current_user.project_id)},
    ).mappings().all()
    sessions = []
    for row in rows:
        item = dict(row)
        conversation_key = _make_conversation_key(
            item.pop("platform_id"), item.pop("conversation_ref")
        )
        # Keep from_user as a compatibility alias during rolling deployment.
        item = {
            "conversation_key": conversation_key,
            "from_user": conversation_key,
            **item,
        }
        sessions.append(item)
    return {"count": len(sessions), "sessions": sessions}


@router.get("/wecom/messages")
async def wecom_messages(
    conv: str,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    """某会话消息记录 (按时间倒序取最近 limit 条, 返回正序)。"""
    if not conv or len(conv) > 512:
        raise HTTPException(status_code=400, detail="conv 参数无效")
    limit = min(max(limit, 1), 1000)
    canonical_key = _parse_conversation_key(conv)
    if canonical_key:
        platform_id, conversation_ref = canonical_key
        conversation_filter = """
            platform_id = :platform_id
            AND COALESCE(NULLIF(BTRIM(raw_payload->>'conv_name'), ''), from_user) = :conversation_ref
        """
        query_params = {
            "platform_id": str(platform_id),
            "conversation_ref": conversation_ref,
            "limit": limit,
            "project_id": str(current_user.project_id),
        }
    else:
        conversation_filter = "from_user = :conv"
        query_params = {
            "conv": conv,
            "limit": limit,
            "project_id": str(current_user.project_id),
        }
    rows = db.execute(
        text(f"""
            SELECT id, message_id, msg_type, from_user, content,
                   raw_payload->>'sender_name' AS sender_name,
                   source_type,
                   (raw_payload->>'is_question')::boolean AS is_question,
                   is_from_colleague,
                   raw_payload->>'conv_name' AS conv_name,
                   fetched_at, ai_reply
            FROM pt_wecom_inbox
            WHERE {conversation_filter}
              AND platform_id IN (SELECT id FROM pt_platforms WHERE project_id=:project_id)
            ORDER BY fetched_at DESC
            LIMIT :limit
        """),
        query_params,
    ).mappings().all()
    msgs = [dict(r) for r in reversed(rows)]
    message_ids = [str(message["message_id"]) for message in msgs if message.get("message_id")]
    media_rows = []
    if message_ids:
        media_rows = db.query(ReplyMonitorMedia).filter(
            ReplyMonitorMedia.project_id == current_user.project_id,
            ReplyMonitorMedia.message_id.in_(message_ids),
        ).order_by(ReplyMonitorMedia.created_at.asc()).all()
    media_by_message = _debug_media_items(media_rows)
    for message in msgs:
        media = media_by_message.get(str(message.get("message_id")), [])
        message["media"] = media
        if media:
            message["media_status"] = "ready" if any(item["status"] == "ready" for item in media) else media[0]["status"]
        elif str(message.get("msg_type") or "").lower() == "image":
            message["media_status"] = "missing"
        else:
            message["media_status"] = "none"
    return {"count": len(msgs), "messages": msgs}


@router.get("/wecom/history-cleanup/preview")
def wecom_history_cleanup_preview(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    _require_debug_admin(current_user)
    raise HTTPException(status_code=410, detail="无截止时间的调试记录清空已停用，请使用 WorkTool 平台的截止时间历史数据清理")


@router.post("/wecom/history-cleanup")
async def wecom_history_cleanup(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    _require_debug_admin(current_user)
    raise HTTPException(status_code=410, detail="无截止时间的调试记录清空已停用，请使用 WorkTool 平台的截止时间历史数据清理")


DEFAULT_TRIGGER = {
    "mode": "hybrid",
    "score_threshold": 60,
    "llm_prefilter": False,
    "ignore_members": [],
    # 转人工关键词 (客户消息命中即转人工, 不依赖 AI 判定)
    "manual_service_kw": ["转人工", "人工客服", "找人工", "人工服务", "转接人工", "真人客服", "我要人工", "人工处理", "联系人工"],
    # 评分词库 (规则评分: 业务词/提问词加分, 闲聊词减分; 未命中任何词时基础分为 0)
    "business_kw": ["激活", "授权", "激活码", "工单", "价格", "多少钱", "购买", "买", "售后", "退货",
                    "换货", "物流", "快递", "发票", "客服", "人工", "怎么用", "如何使用", "故障", "报错",
                    "错误", "登录", "账号", "密码", "K6K8", "k6k8", "安装", "下载", "升级", "版本",
                    "到期", "续费", "退款", "套餐", "报价", "试用"],
    "question_kw": ["怎么", "如何", "请问", "为什么", "能不能", "有没有", "多少", "哪里", "什么", "能否", "是否"],
    "chat_kw": ["哈哈", "哈哈哈", "早上好", "晚上好", "中午好", "晚安", "收到", "在吗", "嗯嗯", "好的", "谢谢", "感谢", "哦"],
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
    raise HTTPException(status_code=410, detail="调试配置接口已停用，请使用平台连接配置")
    data, code = await _aibot_http("GET", "/api/config")
    if code >= 400:
        raise HTTPException(status_code=code, detail=data.get("error") or data)
    return data


@router.put("/wecom/aibot-config")
async def wecom_aibot_config_put(
    payload: dict[str, Any],
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    raise HTTPException(status_code=410, detail="调试配置接口已停用，请使用平台连接配置")
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
    raise HTTPException(status_code=410, detail="调试配置接口已停用，请使用平台连接配置")
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
    raise HTTPException(status_code=410, detail="调试配置接口已停用，请使用平台连接配置")
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
        text("SELECT config FROM pt_platforms WHERE type IN ('wecom_reader', 'worktool') AND is_active = true ORDER BY created_at LIMIT 1")
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
    # 覆盖 wecom_reader + worktool 两种通道类型 (worktool 桥复用 wecom_reader 的触发语义)
    for table in ("pt_platforms", "api_platforms"):
        db.execute(
            text(f"UPDATE {table} SET config = jsonb_set(COALESCE(config, '{{}}'::jsonb), '{{trigger}}', CAST(:trigger AS jsonb)) WHERE type IN ('wecom_reader', 'worktool') AND is_active = true"),
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
