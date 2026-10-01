"""企业微信应用消息推送客户端（tgo-api 侧）。

用途：给客服（企微成员）推送工单提醒等站外通知。
通道：应用消息 `POST /cgi-bin/message/send`（touser=企微成员 userid）。
凭证：来自 Platform.config（corp_id / agent_id / app_secret），与 tgo-platform 的企微配置同源。

注意：企微智能机器人（wecom_bot）只有 response_url 被动回复，没有主动推送接口；
给成员个人发提醒的标准通道就是应用消息。
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
import time
from typing import Optional
from uuid import UUID

import httpx

from app.core.logging import get_logger
from app.models import Platform

logger = get_logger("services.wecom_app_message")

_QYAPI_BASE = "https://qyapi.weixin.qq.com/cgi-bin"
_TOKEN_TTL = 7000  # 企微 access_token 有效期 7200s，提前 200s 过期

# 进程内 token 缓存：{(corp_id, app_secret): (token, expires_at)}
_token_cache: dict[tuple[str, str], tuple[str, float]] = {}
_ticket_cache: dict[tuple[str, str], tuple[str, float]] = {}


class PrivateReminderDeliveryError(RuntimeError):
    """No private WeCom transport accepted and confirmed the reminder."""


async def _get_access_token(corp_id: str, app_secret: str, timeout: float = 10.0) -> Optional[str]:
    """获取企微 access_token（带进程内缓存）。"""
    key = (corp_id, app_secret)
    cached = _token_cache.get(key)
    if cached and cached[1] > time.time():
        return cached[0]
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                f"{_QYAPI_BASE}/gettoken",
                params={"corpid": corp_id, "corpsecret": app_secret},
            )
            data = resp.json()
        token = (data or {}).get("access_token")
        if token:
            _token_cache[key] = (token, time.time() + _TOKEN_TTL)
            return token
        logger.warning("[WECOM_APP] gettoken failed code=%s", data.get("errcode"))
    except Exception as e:  # noqa: BLE001
        logger.warning("[WECOM_APP] gettoken error: %s", e)
    return None


async def send_wecom_app_message(
    platform: Platform,
    to_user: str,
    content: str,
    timeout: float = 10.0,
) -> bool:
    """发送企微应用文本消息给指定成员。

    Args:
        platform: 企微平台（type in wecom/wecom_bot/wecom_reader/wecom_bot_api），
                  config 需含 corp_id / agent_id / app_secret
        to_user: 企微成员 userid
        content: 消息文本（markdown 语法不生效，应用文本消息为纯文本）

    Returns:
        是否发送成功（凭证缺失/API 失败返回 False，不抛异常）
    """
    if not platform or not to_user:
        return False
    cfg = platform.config or {}
    corp_id = cfg.get("corp_id")
    agent_id = cfg.get("agent_id")
    app_secret = cfg.get("app_secret")
    if not (corp_id and agent_id and app_secret):
        logger.warning("[WECOM_APP] platform %s 缺少 corp_id/agent_id/app_secret，跳过推送", platform.id)
        return False

    token = await _get_access_token(corp_id, app_secret, timeout=timeout)
    if not token:
        return False

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(
                f"{_QYAPI_BASE}/message/send",
                params={"access_token": token},
                json={
                    "touser": to_user,
                    "msgtype": "text",
                    "agentid": int(agent_id) if str(agent_id).isdigit() else agent_id,
                    "text": {"content": content[:2048]},
                    "safe": 0,
                    "enable_duplicate_check": 1,
                    "duplicate_check_interval": 1800,
                },
            )
            data = resp.json()
        code = (data or {}).get("errcode")
        if code == 0:
            logger.info("[WECOM_APP] 应用消息已发送 -> %s", to_user)
            return True
        # 40014=token 失效：清缓存重试一次
        if code == 40014:
            _token_cache.pop((corp_id, app_secret), None)
            token = await _get_access_token(corp_id, app_secret, timeout=timeout)
            if token:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        f"{_QYAPI_BASE}/message/send",
                        params={"access_token": token},
                        json={
                            "touser": to_user,
                            "msgtype": "text",
                            "agentid": int(agent_id) if str(agent_id).isdigit() else agent_id,
                            "text": {"content": content[:2048]},
                            "safe": 0,
                            "enable_duplicate_check": 1,
                            "duplicate_check_interval": 1800,
                        },
                    )
                    data = resp.json()
                if (data or {}).get("errcode") == 0:
                    logger.info("[WECOM_APP] 应用消息已发送（token 重试）")
                    return True
        logger.warning("[WECOM_APP] message/send failed: %s", data)
    except Exception as e:  # noqa: BLE001
        logger.warning("[WECOM_APP] message/send error: %s", e)
    return False


async def send_wecom_app_textcard(
    platform: Platform,
    to_user: str,
    title: str,
    description: str,
    url: str,
    timeout: float = 10.0,
) -> bool:
    """Send an exact-jump entry without placing the hidden chat id in its URL."""
    if not platform or not to_user or not url.startswith("https://"):
        return False
    cfg = platform.config or {}
    corp_id, agent_id, app_secret = cfg.get("corp_id"), cfg.get("agent_id"), cfg.get("app_secret")
    if not (corp_id and agent_id and app_secret):
        return False
    token = await _get_access_token(corp_id, app_secret, timeout=timeout)
    if not token:
        return False
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{_QYAPI_BASE}/message/send",
                params={"access_token": token},
                json={
                    "touser": to_user,
                    "msgtype": "textcard",
                    "agentid": int(agent_id) if str(agent_id).isdigit() else agent_id,
                    "textcard": {
                        "title": title[:128],
                        "description": description[:512],
                        "url": url,
                        "btntxt": "前往群聊",
                    },
                    "enable_duplicate_check": 1,
                    "duplicate_check_interval": 300,
                },
            )
            data = response.json()
        return (data or {}).get("errcode") == 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("[WECOM_APP] textcard send failed: %s", exc)
        return False


def find_wecom_jump_platform(db, project_id: UUID) -> Optional[Platform]:
    """Select only a configured self-built app; smart-bot credentials are insufficient."""
    rows = db.query(Platform).filter(
        Platform.project_id == project_id,
        Platform.is_active == True,  # noqa: E712
        Platform.deleted_at.is_(None),
    ).order_by(Platform.created_at.asc()).all()
    for row in rows:
        cfg = row.config or {}
        if cfg.get("corp_id") and cfg.get("agent_id") and cfg.get("app_secret"):
            return row
    return None


async def get_wecom_oauth_userid(platform: Platform, code: str) -> Optional[str]:
    cfg = platform.config or {}
    token = await _get_access_token(str(cfg.get("corp_id") or ""), str(cfg.get("app_secret") or ""))
    if not token or not code:
        return None
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{_QYAPI_BASE}/user/getuserinfo",
            params={"access_token": token, "code": code},
        )
        data = response.json()
    return str((data or {}).get("UserId") or "") or None


async def _get_jsapi_ticket(platform: Platform, ticket_type: str) -> Optional[str]:
    cfg = platform.config or {}
    corp_id, secret = str(cfg.get("corp_id") or ""), str(cfg.get("app_secret") or "")
    cache_key = (corp_id, ticket_type)
    cached = _ticket_cache.get(cache_key)
    if cached and cached[1] > time.time():
        return cached[0]
    token = await _get_access_token(corp_id, secret)
    if not token:
        return None
    endpoint = "get_jsapi_ticket" if ticket_type == "corp" else "ticket/get"
    params = {"access_token": token}
    if ticket_type != "corp":
        params["type"] = "agent_config"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(f"{_QYAPI_BASE}/{endpoint}", params=params)
        data = response.json()
    ticket = str((data or {}).get("ticket") or "")
    if ticket:
        _ticket_cache[cache_key] = (ticket, time.time() + _TOKEN_TTL)
    return ticket or None


def _js_signature(ticket: str, nonce: str, timestamp: int, url: str) -> str:
    raw = f"jsapi_ticket={ticket}&noncestr={nonce}&timestamp={timestamp}&url={url}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()  # noqa: S324 - required by WeCom


async def build_wecom_sdk_config(platform: Platform, page_url: str) -> Optional[dict]:
    """Return corp and agent signatures for the dedicated authorized H5 page."""
    corp_ticket = await _get_jsapi_ticket(platform, "corp")
    agent_ticket = await _get_jsapi_ticket(platform, "agent")
    if not corp_ticket or not agent_ticket:
        return None
    cfg = platform.config or {}
    timestamp = int(time.time())
    nonce = secrets.token_hex(12)
    return {
        "corp_id": str(cfg.get("corp_id")),
        "agent_id": str(cfg.get("agent_id")),
        "timestamp": timestamp,
        "nonce": nonce,
        "corp_signature": _js_signature(corp_ticket, nonce, timestamp, page_url),
        "agent_signature": _js_signature(agent_ticket, nonce, timestamp, page_url),
    }


async def fetch_external_customer_groups(platform: Platform) -> list[dict]:
    """Fetch customer groups visible to the configured customer-contact secret."""
    cfg = platform.config or {}
    corp_id = str(cfg.get("corp_id") or "")
    secret = str(cfg.get("customer_contact_secret") or "")
    if not corp_id or not secret:
        raise ValueError("未配置客户联系 Secret")
    token = await _get_access_token(corp_id, secret)
    if not token:
        raise RuntimeError("无法取得客户联系 access_token")
    groups: list[dict] = []
    cursor = ""
    async with httpx.AsyncClient(timeout=15.0) as client:
        while True:
            payload = {"status_filter": 0, "limit": 100}
            if cursor:
                payload["cursor"] = cursor
            response = await client.post(
                f"{_QYAPI_BASE}/externalcontact/groupchat/list",
                params={"access_token": token}, json=payload,
            )
            data = response.json()
            if (data or {}).get("errcode") != 0:
                raise RuntimeError(f"客户群列表同步失败：{(data or {}).get('errmsg', 'unknown')}")
            for brief in (data or {}).get("group_chat_list", []):
                chat_id = str(brief.get("chat_id") or "")
                if not chat_id:
                    continue
                detail_response = await client.post(
                    f"{_QYAPI_BASE}/externalcontact/groupchat/get",
                    params={"access_token": token}, json={"chat_id": chat_id, "need_name": 1},
                )
                detail = detail_response.json()
                if (detail or {}).get("errcode") != 0:
                    continue
                chat = (detail or {}).get("group_chat") or {}
                groups.append({
                    "chat_id": chat_id,
                    "name": str(chat.get("name") or ""),
                    "owner": str(chat.get("owner") or "") or None,
                    "members": tuple(
                        str(member.get("userid") or member.get("unionid") or member.get("external_userid") or "")
                        for member in chat.get("member_list", [])
                        if member.get("userid") or member.get("unionid") or member.get("external_userid")
                    ),
                })
            cursor = str((data or {}).get("next_cursor") or "")
            if not cursor:
                break
    return groups


def find_wecom_platform(db, project_id: UUID) -> Optional[Platform]:
    """取项目下第一个企微类平台（wecom / wecom_bot / wecom_reader / wecom_bot_api）。"""
    types = ("wecom", "wecom_bot", "wecom_reader", "wecom_bot_api")
    return (
        db.query(Platform)
        .filter(
            Platform.project_id == project_id,
            Platform.type.in_(types),
            Platform.is_active == True,  # noqa: E712
            Platform.deleted_at.is_(None),
        )
        .order_by(Platform.created_at.asc())
        .first()
    )


async def send_worktool_private_message(
    platform: Platform,
    target_title: str,
    content: str,
    timeout: float = 30.0,
    idempotency_key: Optional[str] = None,
) -> bool:
    """Ask the WorkTool phone to open a colleague chat and confirm the send."""
    cfg = platform.config or {}
    gateway_url = str(cfg.get("gateway_url") or "").rstrip("/")
    robot_id = str(cfg.get("robot_id") or "").strip()
    api_key = str(cfg.get("api_key") or "").strip()
    if not (gateway_url and robot_id and target_title):
        return False

    headers = {"X-API-Key": api_key} if api_key else {}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            payload = {
                "robot_id": robot_id,
                "title": target_title,
                "content": content[:20480],
            }
            if idempotency_key:
                payload["idempotency_key"] = idempotency_key
            response = await client.post(
                f"{gateway_url}/api/send",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            send_id = str((data or {}).get("send_id") or "")
            accepted_status = (data or {}).get("status")
            if not send_id:
                return False
            if accepted_status == "success":
                return True
            if accepted_status in {"failed", "timeout"}:
                return False

            # A queued command only means the gateway accepted it. Do not mark
            # the reminder delivered until the phone reports actual success.
            for _ in range(max(1, int(timeout / 0.5))):
                await asyncio.sleep(0.5)
                status_response = await client.get(
                    f"{gateway_url}/api/sends/{send_id}", headers=headers
                )
                status_response.raise_for_status()
                send_status = (status_response.json() or {}).get("status")
                if send_status == "success":
                    return True
                if send_status in {"failed", "timeout"}:
                    return False
    except Exception as exc:  # noqa: BLE001
        logger.warning("[WORKTOOL_REMINDER] private send failed: %s", exc)
    return False


async def send_wecom_bot_private_message(
    platform: Platform,
    to_user: str,
    content: str,
    timeout: float = 15.0,
    idempotency_key: Optional[str] = None,
) -> bool:
    """Push a private message through the WeCom smart-bot WS sender."""
    cfg = platform.config or {}
    sender_url = str(cfg.get("sender_url") or os.getenv("WECOM_AIBOT_CONTROL_URL") or os.getenv("WECOM_DEBUG_AIBOT_URL") or "").rstrip("/")
    send_token = str(os.getenv("AIBOT_CONTROL_TOKEN") or os.getenv("WT_SEND_TOKEN") or cfg.get("send_token") or "").strip()
    if not (sender_url and to_user and content):
        return False
    headers = {"X-Send-Token": send_token} if send_token else {}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            payload = {
                "chatid": to_user,
                "content": content[:20480],
                "msgtype": "markdown",
            }
            if idempotency_key:
                payload["idempotency_key"] = idempotency_key
            response = await client.post(
                f"{sender_url}/api/send",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            return (response.json() or {}).get("ok") is True
    except Exception as exc:  # noqa: BLE001
        logger.warning("[WECOM_BOT_REMINDER] private send failed: %s", exc)
        return False


async def send_staff_private_reminder(
    db, staff, content: str, idempotency_key: Optional[str] = None
) -> str:
    """Send an internal reminder privately to its responsible staff member.

    The managed smart-bot addresses the member by immutable UserID. A legacy
    WeCom application remains compatible, but WorkTool is intentionally never
    used as the internal-reminder fallback or as a replacement data source.

    Returns the confirmed transport name and raises on every non-delivery so
    the reminder scanner can retry without advancing its sequence counter.
    """
    platforms = (
        db.query(Platform)
        .filter(
            Platform.project_id == staff.project_id,
            Platform.is_active == True,  # noqa: E712
            Platform.deleted_at.is_(None),
        )
        .order_by(Platform.created_at.asc())
        .all()
    )
    userid = str(staff.wecom_userid or "").strip()
    errors: list[str] = []

    for platform in platforms:
        cfg = platform.config or {}
        if platform.type != "wecom_bot" or not (getattr(platform, "connection_active", None) or cfg.get("sender_url")):
            continue
        if not userid:
            errors.append("负责人未配置企微 UserID")
            break
        bot_sent = (
            await send_wecom_bot_private_message(
                platform, userid, content, idempotency_key=idempotency_key
            )
            if idempotency_key
            else await send_wecom_bot_private_message(platform, userid, content)
        )
        if bot_sent:
            return "wecom_bot"
        errors.append("企业微信智能机器人私聊发送失败")

    for platform in platforms:
        cfg = platform.config or {}
        if platform.type not in {"wecom", "wecom_bot", "wecom_reader", "wecom_bot_api"}:
            continue
        if not (cfg.get("corp_id") and cfg.get("agent_id") and cfg.get("app_secret")):
            continue
        if not userid:
            errors.append("负责人未配置企微 UserID")
            break
        if await send_wecom_app_message(platform, userid, content):
            return "wecom_app"
        errors.append("企业微信应用消息发送失败")

    detail = "；".join(errors) if errors else "未配置可用的企微私聊通道"
    raise PrivateReminderDeliveryError(detail)
