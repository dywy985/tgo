"""企业微信应用消息推送客户端（tgo-api 侧）。

用途：给客服（企微成员）推送工单提醒等站外通知。
通道：应用消息 `POST /cgi-bin/message/send`（touser=企微成员 userid）。
凭证：来自 Platform.config（corp_id / agent_id / app_secret），与 tgo-platform 的企微配置同源。

注意：企微智能机器人（wecom_bot）只有 response_url 被动回复，没有主动推送接口；
给成员个人发提醒的标准通道就是应用消息。
"""

from __future__ import annotations

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
        logger.warning("[WECOM_APP] gettoken failed: %s", data)
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
                        },
                    )
                    data = resp.json()
                if (data or {}).get("errcode") == 0:
                    logger.info("[WECOM_APP] 应用消息已发送（token 重试）-> %s", to_user)
                    return True
        logger.warning("[WECOM_APP] message/send failed: %s", data)
    except Exception as e:  # noqa: BLE001
        logger.warning("[WECOM_APP] message/send error: %s", e)
    return False


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
