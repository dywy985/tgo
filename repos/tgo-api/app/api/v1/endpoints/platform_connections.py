"""Production connection management for WorkTool and WeCom long-connection channels."""

from __future__ import annotations

import ipaddress
import secrets
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.core.security import get_current_active_user
from app.models import Platform, PlatformConnectionAudit, PlatformConnectionGap, PlatformDataResetJob, Staff
from app.services.platform_sync import trigger_platform_sync
from app.services.history_cleanup_service import (
    DEFAULT_CUTOFF_UTC,
    delete_history_before,
    hash_cleanup_token,
    history_cleanup_preview,
    parse_cleanup_cutoff,
    verify_cleanup_token,
)
from app.utils.crypto import decrypt_str, encrypt_str


router = APIRouter()
SUPPORTED_TYPES = {"worktool", "wecom_bot"}
OFFICIAL_WECOM_WS = "wss://openws.work.weixin.qq.com"
SENSITIVE_CONFIG_KEYS = {"secret", "api_key", "send_token", "app_secret", "device_secrets", "password", "token"}


class ConnectionConfigPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    config: dict[str, Any]


class ResetExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmation: str = Field(min_length=1, max_length=100)


class HistoryCleanupExecuteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preview_job_id: UUID
    confirmation_token: str = Field(min_length=20, max_length=200)
    cutoff: str


def _admin(user: Staff) -> Staff:
    if str(getattr(user, "role", "")) != "admin":
        raise HTTPException(403, "仅管理员可管理消息通路")
    return user


def _platform(db: Session, platform_id: UUID, user: Staff) -> Platform:
    row = db.query(Platform).filter(
        Platform.id == platform_id,
        Platform.project_id == user.project_id,
        Platform.deleted_at.is_(None),
    ).first()
    if not row:
        raise HTTPException(404, "平台不存在")
    if row.type not in SUPPORTED_TYPES:
        raise HTTPException(400, "该平台类型不支持连接管理")
    return row


def _secret_envelope(platform: Platform) -> dict[str, Any]:
    raw = decrypt_str(platform.connection_secrets_encrypted or "")
    if not raw:
        return {"draft": {}, "active": {}}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {"draft": {}, "active": {}}
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(500, "连接凭证无法解密，请先恢复密钥")


def _store_secrets(platform: Platform, envelope: dict[str, Any]) -> None:
    platform.connection_secrets_encrypted = encrypt_str(
        json.dumps(envelope, ensure_ascii=False, sort_keys=True)
    )


def _scrub_public_config(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _scrub_public_config(item) for key, item in value.items() if str(key).lower() not in SENSITIVE_CONFIG_KEYS}
    if isinstance(value, list):
        return [_scrub_public_config(item) for item in value]
    return value


def _allowed_service_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(422, "网关地址必须是 http/https URL")
    allow = {item.strip().lower() for item in os.getenv("CHANNEL_GATEWAY_HOST_ALLOWLIST", "").split(",") if item.strip()}
    host = parsed.hostname.lower()
    allowed = host in {"localhost", "127.0.0.1", "::1"} or host in allow or host.endswith(".internal")
    try:
        allowed = allowed or ipaddress.ip_address(host).is_private
    except ValueError:
        pass
    if not allowed:
        raise HTTPException(422, "网关主机不在管理员允许列表中")
    return value.rstrip("/")


def _normalize_worktool(db: Session, user: Staff, incoming: dict[str, Any], previous: dict[str, Any]) -> tuple[dict, dict]:
    gateway_url = _allowed_service_url(str(incoming.get("gateway_url") or previous.get("gateway_url") or ""))
    threshold = int(incoming.get("offline_threshold_seconds", previous.get("offline_threshold_seconds", 60)))
    if threshold < 20 or threshold > 3600:
        raise HTTPException(422, "离线阈值必须在 20 到 3600 秒之间")
    devices = incoming.get("devices")
    if not isinstance(devices, list) or not 1 <= len(devices) <= 20:
        raise HTTPException(422, "必须配置 1 到 20 台设备")
    previous_secrets = previous.get("_secrets", {})
    public_devices: list[dict[str, Any]] = []
    secrets: dict[str, str] = {}
    seen: set[str] = set()
    for item in devices:
        if not isinstance(item, dict):
            raise HTTPException(422, "设备配置格式无效")
        robot_id = str(item.get("robot_id") or "").strip()
        if len(robot_id) < 16 or len(robot_id) > 255 or robot_id in seen:
            raise HTTPException(422, "robot_id 长度不足、过长或重复")
        seen.add(robot_id)
        device_mode = str(item.get("device_mode") or "staff").strip()
        if device_mode not in {"staff", "robot"}:
            raise HTTPException(422, "设备身份只能是客服或机器人")
        staff = None
        staff_id = ""
        if device_mode == "staff":
            staff_id = str(item.get("bound_staff_id") or "").strip()
            try:
                staff_uuid = UUID(staff_id)
            except ValueError:
                raise HTTPException(422, "客服设备必须绑定有效客服")
            staff = db.query(Staff).filter(Staff.id == staff_uuid, Staff.project_id == user.project_id).first()
            if not staff or not staff.wecom_userid:
                raise HTTPException(422, "绑定客服不存在或未配置企微 UserID")
        secret = str(item.get("secret") or previous_secrets.get(robot_id) or "").strip()
        if len(secret) < 24:
            raise HTTPException(422, f"设备 {robot_id[:8]} 的独立密钥至少需要 24 个字符")
        secrets[robot_id] = secret
        public_devices.append({
            "name": str(item.get("name") or (staff.nickname or staff.name or staff.username if staff else "机器人设备"))[:100],
            "robot_id": robot_id,
            "device_mode": device_mode,
            "bound_staff_id": staff_id,
            "bound_staff_name": (staff.nickname or staff.name or staff.username) if staff else "",
            "wecom_userid": staff.wecom_userid if staff else "",
            "enabled": bool(item.get("enabled", True)),
            "identity_confirmed": bool(item.get("identity_confirmed", False)),
            "secret_set": True,
            "secret_last4": secret[-4:],
        })
    if not any(device["enabled"] for device in public_devices):
        raise HTTPException(422, "至少需要启用一台 WorkTool 设备")
    return {
        "gateway_url": gateway_url,
        "offline_threshold_seconds": threshold,
        "devices": public_devices,
        "message_source": "worktool_only",
    }, secrets


def _normalize_aibot(incoming: dict[str, Any], previous_secret: str) -> tuple[dict, dict]:
    bot_id = str(incoming.get("bot_id") or "").strip()
    if not bot_id:
        raise HTTPException(422, "Bot ID 不能为空")
    secret = str(incoming.get("secret") or previous_secret or "").strip()
    if len(secret) < 8:
        raise HTTPException(422, "Secret 未配置或格式无效")
    ws_url = str(incoming.get("ws_url") or OFFICIAL_WECOM_WS).rstrip("/")
    allowed = {OFFICIAL_WECOM_WS, *[v.strip().rstrip("/") for v in os.getenv("WECOM_WS_URL_ALLOWLIST", "").split(",") if v.strip()]}
    if ws_url not in allowed:
        raise HTTPException(422, "长连接地址不在管理员允许列表中")
    return {
        "bot_id": bot_id,
        "bot_name": str(incoming.get("bot_name") or "")[:100],
        "ws_url": ws_url,
        "enabled": bool(incoming.get("enabled", True)),
        "secret_set": True,
        "secret_last4": secret[-4:],
        "message_source": "internal_notifications_only",
    }, {"secret": secret}


def _runtime_payload(platform: Platform, public: dict, secrets: dict, version: int | None = None) -> dict:
    payload = {"platform_id": str(platform.id), "version": platform.connection_version + 1 if version is None else version, **public}
    if platform.type == "worktool":
        payload["devices"] = [
            {**device, "secret": secrets.get(device["robot_id"], "")}
            for device in public.get("devices", [])
        ]
    else:
        payload["secret"] = secrets.get("secret", "")
    return payload


async def _runtime_call(platform: Platform, action: str, public: dict, secrets: dict, version: int | None = None) -> dict:
    payload = _runtime_payload(platform, public, secrets, version)
    if platform.type == "worktool":
        base = public["gateway_url"]
        token = os.getenv("WORKTOOL_CONTROL_TOKEN") or os.getenv("WECOM_DEBUG_WORKTOOL_API_KEY", "")
        url = f"{base}/api/admin/config/{action}"
        headers = {"X-API-Key": token} if token else {}
    else:
        base = os.getenv("WECOM_AIBOT_CONTROL_URL") or os.getenv("WECOM_DEBUG_AIBOT_URL", "http://172.26.192.1:8791")
        token = os.getenv("AIBOT_CONTROL_TOKEN") or os.getenv("WT_SEND_TOKEN", "")
        url = f"{base.rstrip('/')}/api/config/{action}"
        headers = {"X-Send-Token": token} if token else {}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(url, json=payload, headers=headers)
        data = response.json()
    except (httpx.RequestError, ValueError) as exc:
        raise HTTPException(502, f"连接服务不可用: {type(exc).__name__}")
    if response.status_code >= 400 or not data.get("ok"):
        raise HTTPException(502, str(data.get("error") or data.get("detail") or "连接测试失败")[:300])
    return data


async def _runtime_deactivate(platform: Platform, public: dict) -> None:
    if platform.type == "worktool":
        base = str(public.get("gateway_url") or "").rstrip("/")
        token = os.getenv("WORKTOOL_CONTROL_TOKEN") or os.getenv("WECOM_DEBUG_WORKTOOL_API_KEY", "")
        headers = {"X-API-Key": token} if token else {}
    else:
        base = (os.getenv("WECOM_AIBOT_CONTROL_URL") or os.getenv("WECOM_DEBUG_AIBOT_URL", "http://172.26.192.1:8791")).rstrip("/")
        token = os.getenv("AIBOT_CONTROL_TOKEN") or os.getenv("WT_SEND_TOKEN", "")
        headers = {"X-Send-Token": token} if token else {}
    if base:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(f"{base}/api/{'admin/' if platform.type == 'worktool' else ''}config/deactivate", json={"platform_id": str(platform.id)}, headers=headers)


def _response(platform: Platform) -> dict:
    envelope = _secret_envelope(platform)
    draft = dict(platform.connection_draft or {})
    active = dict(platform.connection_active or {})
    return {
        "platform_id": str(platform.id),
        "type": platform.type,
        "state": platform.connection_state,
        "version": platform.connection_version,
        "draft": draft,
        "active": active,
        "has_draft_credentials": bool(envelope.get("draft")),
        "has_active_credentials": bool(envelope.get("active")),
        "cutover_at": platform.connection_cutover_at,
    }


@router.get("/{platform_id}/connection-config")
def get_connection_config(platform_id: UUID, db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)) -> dict:
    _admin(current_user)
    return _response(_platform(db, platform_id, current_user))


@router.patch("/{platform_id}/connection-config")
def patch_connection_config(payload: ConnectionConfigPatch, platform_id: UUID, db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)) -> dict:
    _admin(current_user)
    platform = _platform(db, platform_id, current_user)
    envelope = _secret_envelope(platform)
    previous_public = dict(platform.connection_draft or platform.connection_active or {})
    if platform.type == "worktool":
        previous_public["_secrets"] = envelope.get("draft") or envelope.get("active") or {}
        public, secrets = _normalize_worktool(db, current_user, payload.config, previous_public)
    else:
        public, secrets = _normalize_aibot(payload.config, (envelope.get("draft") or envelope.get("active") or {}).get("secret", ""))
    platform.connection_draft = public
    platform.connection_state = "draft"
    envelope["draft"] = secrets
    _store_secrets(platform, envelope)
    db.add(PlatformConnectionAudit(project_id=platform.project_id, platform_id=platform.id, actor_staff_id=current_user.id, action="draft_saved", config_version=platform.connection_version, details={"device_count": len(public.get("devices", []))}))
    db.commit()
    return _response(platform)


@router.post("/{platform_id}/connection-test")
async def test_connection(platform_id: UUID, db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)) -> dict:
    _admin(current_user)
    platform = _platform(db, platform_id, current_user)
    if not platform.connection_draft:
        raise HTTPException(409, "请先保存草稿")
    if platform.type == "worktool" and any(device.get("enabled", True) and not device.get("identity_confirmed") for device in platform.connection_draft.get("devices", [])):
        raise HTTPException(409, "请先在手机确认真实登录账号与设备身份一致")
    if platform.type == "wecom_bot" and platform.connection_active and platform.connection_active.get("bot_id") == platform.connection_draft.get("bot_id"):
        raise HTTPException(409, "同一 Bot ID 的官方长连接具有独占性，无法在不中断当前连接时重复测试；请使用新的 Bot ID")
    secrets = _secret_envelope(platform).get("draft") or {}
    result = await _runtime_call(platform, "test", platform.connection_draft, secrets)
    if platform.type == "worktool" and any(not device.get("online") for device in result.get("devices", [])):
        db.add(PlatformConnectionAudit(project_id=platform.project_id, platform_id=platform.id, actor_staff_id=current_user.id, action="connection_test_failed", config_version=platform.connection_version, details={"reason": "device_offline"}))
        db.commit()
        raise HTTPException(409, "所有启用的 WorkTool 设备必须在线且心跳正常后才能通过测试")
    platform.connection_state = "tested"
    db.add(PlatformConnectionAudit(project_id=platform.project_id, platform_id=platform.id, actor_staff_id=current_user.id, action="connection_tested", config_version=platform.connection_version, details={"ok": True}))
    db.commit()
    return result


@router.post("/{platform_id}/activate")
async def activate_connection(platform_id: UUID, db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)) -> dict:
    _admin(current_user)
    platform = _platform(db, platform_id, current_user)
    if not platform.connection_draft or platform.connection_state != "tested":
        raise HTTPException(409, "请先保存并成功测试草稿")
    envelope = _secret_envelope(platform)
    draft_secrets = envelope.get("draft") or {}
    incumbents = db.query(Platform).filter(Platform.project_id == platform.project_id, Platform.type == platform.type, Platform.id != platform.id, Platform.is_active.is_(True), Platform.deleted_at.is_(None)).all()
    incumbent = next((item for item in incumbents if item.connection_active), None)
    rollback_platform = platform if platform.connection_active else incumbent
    previous_public = dict(rollback_platform.connection_active or {}) if rollback_platform else {}
    previous_secrets = (_secret_envelope(rollback_platform).get("active") or {}) if rollback_platform else {}
    previous_version = rollback_platform.connection_version if rollback_platform else 0
    # Runtime applies first. A failed apply leaves the previous DB and runtime
    # active configuration untouched.
    try:
        runtime = await _runtime_call(platform, "activate", platform.connection_draft, draft_secrets)
    except HTTPException as exc:
        db.add(PlatformConnectionAudit(project_id=platform.project_id, platform_id=platform.id, actor_staff_id=current_user.id, action="activation_failed", config_version=platform.connection_version, details={"status_code": exc.status_code}))
        db.commit()
        raise
    platform.connection_version += 1
    platform.is_active = True
    platform.connection_active = dict(platform.connection_draft)
    platform.connection_state = "active"
    platform.connection_cutover_at = platform.connection_cutover_at or datetime.now(timezone.utc)
    envelope["active"] = draft_secrets
    _store_secrets(platform, envelope)
    platform.config = {**_scrub_public_config(platform.config or {}), **platform.connection_active, "connection_version": platform.connection_version, "inbound_stats_enabled": platform.type == "worktool"}
    platform.ai_mode = "off"
    platform.fallback_to_ai_timeout = 0
    for old in incumbents:
        old.is_active = False
        old.connection_state = "archived"
        old.config = {**_scrub_public_config(old.config or {}), "inbound_stats_enabled": False, "archived": True}
        old_envelope = _secret_envelope(old)
        old_envelope["active"] = {}; old_envelope["draft"] = {}
        _store_secrets(old, old_envelope)
        db.add(PlatformConnectionAudit(project_id=old.project_id, platform_id=old.id, actor_staff_id=current_user.id, action="archived_on_cutover", config_version=old.connection_version, details={"public_config_snapshot": old.connection_active, "replacement_platform_id": str(platform.id)}))
    db.add(PlatformConnectionAudit(project_id=platform.project_id, platform_id=platform.id, actor_staff_id=current_user.id, action="activated", config_version=platform.connection_version, details={"runtime": runtime.get("status", "ok"), "public_config_snapshot": platform.connection_active}))
    try:
        db.commit()
    except Exception:
        db.rollback()
        try:
            if previous_public:
                await _runtime_call(rollback_platform or platform, "activate", previous_public, previous_secrets, version=previous_version)
            else:
                await _runtime_deactivate(platform, platform.connection_draft)
        finally:
            raise
    trigger_platform_sync(str(platform.id))
    for old in incumbents:
        trigger_platform_sync(str(old.id))
    return _response(platform)


async def _runtime_status(platform: Platform) -> dict:
    active = dict(platform.connection_active or {})
    if not active:
        return {"state": "DISCONNECTED", "severity": "warning", "reason": "not_activated"}
    if platform.type == "worktool":
        token = os.getenv("WORKTOOL_CONTROL_TOKEN") or os.getenv("WECOM_DEBUG_WORKTOOL_API_KEY", "")
        url = f"{active.get('gateway_url', '').rstrip('/')}/api/robots"
        headers = {"X-API-Key": token} if token else {}
    else:
        base = os.getenv("WECOM_AIBOT_CONTROL_URL") or os.getenv("WECOM_DEBUG_AIBOT_URL", "http://172.26.192.1:8791")
        token = os.getenv("AIBOT_CONTROL_TOKEN") or os.getenv("WT_SEND_TOKEN", "")
        url = f"{base.rstrip('/')}/api/status"
        headers = {"X-Send-Token": token} if token else {}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(url, headers=headers)
        data = response.json()
        if response.status_code >= 400:
            raise ValueError("runtime rejected status request")
    except Exception:
        return {"state": "ERROR", "severity": "critical" if platform.type == "worktool" else "warning", "reason": "runtime_unreachable"}
    if platform.type == "wecom_bot":
        connected = bool(data.get("ready"))
        state = str(data.get("connection_state") or ("CONNECTED" if connected else "DISCONNECTED"))
        return {**data, "state": state, "severity": "ok" if connected else "warning"}
    return _build_worktool_runtime_status(active, data)


def _build_worktool_runtime_status(active: dict, data: dict) -> dict:
    """Merge the managed WorkTool configuration with gateway runtime state."""
    configured = {
        device["robot_id"]: device
        for device in active.get("devices", [])
        if device.get("enabled", True)
    }
    online = {robot.get("robot_id"): robot for robot in data.get("robots", [])}
    devices = [
        {**device, **online.get(robot_id, {}), "online": robot_id in online}
        for robot_id, device in configured.items()
    ]
    threshold = int(active.get("offline_threshold_seconds", 60))
    all_online = bool(devices) and all(
        device["online"] and float(device.get("idle_sec", 9999)) <= threshold
        for device in devices
    )
    return {
        "state": "CONNECTED" if all_online else "DISCONNECTED",
        "severity": "ok" if all_online else "critical",
        "config_version": int(data.get("config_version") or data.get("version") or 0),
        "devices": devices,
        "message_source": "worktool_only",
    }


async def _runtime_discovered_users(platform: Platform) -> dict:
    """Fetch metadata-only private contacts from this managed WeCom bot."""
    if platform.type != "wecom_bot":
        raise ValueError("identity discovery requires a WeCom bot platform")
    base = os.getenv("WECOM_AIBOT_CONTROL_URL") or os.getenv(
        "WECOM_DEBUG_AIBOT_URL", "http://172.26.192.1:8791"
    )
    token = os.getenv("AIBOT_CONTROL_TOKEN") or os.getenv("WT_SEND_TOKEN", "")
    if not token:
        raise RuntimeError("control_token_missing")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{base.rstrip('/')}/api/discovered-users",
            headers={"X-Send-Token": token},
        )
    data = response.json()
    if response.status_code >= 400:
        raise RuntimeError("runtime_rejected_identity_sync")
    return data


@router.get("/{platform_id}/connection-status")
async def connection_status(platform_id: UUID, db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)) -> dict:
    platform = _platform(db, platform_id, current_user)
    runtime = await _runtime_status(platform)
    new_gaps = _record_worktool_gaps(db, platform, runtime)
    if new_gaps:
        await _notify_gap_admins(db, platform, new_gaps)
    gaps = db.query(PlatformConnectionGap).filter(PlatformConnectionGap.platform_id == platform.id, PlatformConnectionGap.reason == "offline").order_by(PlatformConnectionGap.started_at.desc()).limit(20).all()
    if platform.type == "worktool" and runtime.get("reason") == "runtime_unreachable" and not any(gap.ended_at is None for gap in gaps):
        runtime = {**runtime, "state": "RECONNECTING", "severity": "warning", "reason": "offline_confirmation_pending"}
    return {
        "platform_id": str(platform.id), "type": platform.type,
        "version": platform.connection_version, "cutover_at": platform.connection_cutover_at,
        "data_complete": runtime.get("severity") != "critical",
        "gaps": [{"device_id": gap.device_id, "reason": gap.reason, "started_at": gap.started_at, "ended_at": gap.ended_at} for gap in gaps],
        **runtime,
    }


def _record_worktool_gaps(db: Session, platform: Platform, runtime: dict) -> list[PlatformConnectionGap]:
    if platform.type != "worktool" or not platform.connection_active:
        return []
    db.query(Platform).filter(Platform.id == platform.id).with_for_update().one()
    now = datetime.now(timezone.utc)
    open_gaps = db.query(PlatformConnectionGap).filter(PlatformConnectionGap.platform_id == platform.id, PlatformConnectionGap.ended_at.is_(None)).all()
    open_by_device = {gap.device_id: gap for gap in open_gaps}
    threshold = int((platform.connection_active or {}).get("offline_threshold_seconds", 60))
    device_status = {str(device.get("robot_id")): device for device in runtime.get("devices", [])}
    offline_ids = {device_id for device_id, device in device_status.items() if not device.get("online") or float(device.get("idle_sec", 9999)) > threshold}
    if runtime.get("severity") == "critical" and not runtime.get("devices"):
        offline_ids = {str(device.get("robot_id")) for device in (platform.connection_active or {}).get("devices", []) if device.get("enabled", True)}
    created = []
    runtime_has_devices = bool(runtime.get("devices"))
    for device_id in offline_ids - set(open_by_device):
        last_seen = device_status.get(device_id, {}).get("last_seen")
        started_at = datetime.fromtimestamp(float(last_seen), timezone.utc) if last_seen else now
        gap = PlatformConnectionGap(project_id=platform.project_id, platform_id=platform.id, device_id=device_id, reason="offline" if runtime_has_devices else "pending_offline", started_at=started_at)
        db.add(gap)
        if runtime_has_devices:
            created.append(gap)
    for device_id, gap in open_by_device.items():
        if device_id not in offline_ids:
            if gap.reason == "pending_offline":
                db.delete(gap)
            else:
                gap.ended_at = now
        elif gap.reason == "pending_offline" and now - gap.started_at >= timedelta(seconds=threshold):
            gap.reason = "offline"; created.append(gap)
    db.commit()
    return created


async def _notify_gap_admins(db: Session, platform: Platform, gaps: list[PlatformConnectionGap]) -> None:
    from app.services.wecom_app_client import send_staff_private_reminder
    admins = db.query(Staff).filter(Staff.project_id == platform.project_id, Staff.role == "admin").all()
    devices = "、".join(gap.device_id or "未知设备" for gap in gaps)
    for admin in admins:
        try:
            await send_staff_private_reminder(db, admin, f"消息通路异常：WorkTool 设备 {devices} 已超过离线阈值。统计缺口已记录，不会以零消息补齐。", idempotency_key=f"worktool-gap:{platform.id}:{gaps[0].id}:{admin.id}")
        except Exception:
            pass


def _count(db: Session, sql: str, params: dict) -> int:
    return int(db.execute(text(sql), params).scalar() or 0)


@router.get("/{platform_id}/data-reset/preview")
def data_reset_preview(
    platform_id: UUID,
    cutoff: str = Query("2026-09-04T00:00:00+08:00"),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    _admin(current_user)
    platform = _platform(db, platform_id, current_user)
    if platform.type != "worktool":
        raise HTTPException(400, "仅 WorkTool 平台支持历史数据清理")
    try:
        cutoff_utc = parse_cleanup_cutoff(cutoff)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if cutoff_utc != DEFAULT_CUTOFF_UTC:
        raise HTTPException(422, "本次清理截止时间固定为北京时间 2026-09-04 00:00:00")
    preview = history_cleanup_preview(db, str(platform.project_id), cutoff_utc)
    confirmation_token = secrets.token_urlsafe(32)
    token_digest = hash_cleanup_token(confirmation_token, preview["fingerprint"])
    job = PlatformDataResetJob(
        project_id=platform.project_id, platform_id=platform.id,
        actor_staff_id=current_user.id, status="previewed", progress=0,
        operation="history_cutoff_cleanup", target_ids=preview["target_ids"],
        preview_counts=preview["counts"],
        result={"cutoff_utc": preview["cutoff_utc"], "fingerprint": preview["fingerprint"], "token_digest": token_digest, "used": False},
    )
    db.add(job); db.commit(); db.refresh(job)
    return {
        "platform_id": str(platform.id), "platform_name": platform.name or "未命名平台",
        "preview_job_id": str(job.id), "confirmation_token": confirmation_token,
        "cutoff_utc": preview["cutoff_utc"], "counts": preview["counts"],
        "target_id_summary": preview["target_id_summary"], "requires_backup": True,
        "preserves": ["accounts", "staff", "projects", "platform_connections", "customer_rosters", "monitor_settings", "knowledge_bases", "records_at_or_after_cutoff"],
    }


@router.get("/{platform_id}/reply-monitor-ticket-cleanup/preview")
def reply_monitor_ticket_cleanup_preview(
    platform_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    _admin(current_user)
    platform = _platform(db, platform_id, current_user)
    if platform.type != "worktool":
        raise HTTPException(400, "仅 WorkTool 平台支持监控工单清理")
    rows = db.execute(text("""
        SELECT t.id, t.number, t.title, t.created_at, count(a.id) AS attachment_count
        FROM api_tickets t LEFT JOIN api_ticket_attachments a ON a.ticket_id=t.id
        WHERE t.project_id=:project_id AND t.source='reply_monitor'
        GROUP BY t.id, t.number, t.title, t.created_at ORDER BY t.created_at
    """), {"project_id": str(platform.project_id)}).mappings().all()
    return {
        "platform_id": str(platform.id), "platform_name": platform.name or "未命名平台",
        "ticket_count": len(rows), "requires_backup": True,
        "tickets": [{**dict(row), "id": str(row["id"])} for row in rows],
        "preserves": ["manual_tickets", "non_reply_monitor_tickets", "messages", "media"],
    }


@router.post("/{platform_id}/reply-monitor-ticket-cleanup")
async def execute_reply_monitor_ticket_cleanup(
    payload: ResetExecuteRequest,
    platform_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    _admin(current_user)
    platform = _platform(db, platform_id, current_user)
    if platform.type != "worktool" or payload.confirmation != (platform.name or "未命名平台"):
        raise HTTPException(409, "平台名称确认不匹配")
    if not os.getenv("CHANNEL_DATA_BACKUP_URL", "").strip():
        raise HTTPException(503, "未配置备份服务，已拒绝删除")
    preview = reply_monitor_ticket_cleanup_preview(platform_id, db, current_user)
    target_ids = [item["id"] for item in preview["tickets"]]
    job = PlatformDataResetJob(
        project_id=platform.project_id, platform_id=platform.id,
        actor_staff_id=current_user.id, status="queued", progress=0,
        operation="reply_monitor_ticket_cleanup", target_ids=target_ids,
        preview_counts={"reply_monitor_tickets": len(target_ids)},
    )
    db.add(job); db.commit(); db.refresh(job)
    background_tasks.add_task(_run_data_reset, job.id)
    return {"ok": True, "job_id": str(job.id), "status": job.status, "progress": 0}


@router.post("/{platform_id}/data-reset")
async def execute_data_reset(payload: HistoryCleanupExecuteRequest, platform_id: UUID, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)) -> dict:
    """Queue an exact pre-cutoff cleanup only when its one-time preview still matches."""
    _admin(current_user)
    platform = _platform(db, platform_id, current_user)
    if platform.type != "worktool":
        raise HTTPException(400, "仅 WorkTool 平台支持历史数据清理")
    if platform.is_active:
        raise HTTPException(409, "请先停用旧 WorkTool 平台并排空消息队列")
    if not os.getenv("CHANNEL_DATA_BACKUP_URL", "").strip() or not os.getenv("WUKONGIM_CUTOFF_REBUILD_URL", "").strip():
        raise HTTPException(503, "未配置全库备份或 WuKongIM 截止时间重建服务，已拒绝删除")
    job = db.query(PlatformDataResetJob).filter(
        PlatformDataResetJob.id == payload.preview_job_id,
        PlatformDataResetJob.project_id == platform.project_id,
        PlatformDataResetJob.platform_id == platform.id,
        PlatformDataResetJob.operation == "history_cutoff_cleanup",
        PlatformDataResetJob.status == "previewed",
    ).first()
    if not job or not job.result or job.result.get("used"):
        raise HTTPException(409, "清理预览不存在、已使用或已过期")
    try:
        cutoff_utc = parse_cleanup_cutoff(payload.cutoff)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if cutoff_utc != DEFAULT_CUTOFF_UTC or job.result.get("cutoff_utc") != cutoff_utc.isoformat():
        raise HTTPException(409, "截止时间与预览不一致")
    preview = history_cleanup_preview(db, str(platform.project_id), cutoff_utc)
    fingerprint = str(job.result.get("fingerprint") or "")
    if preview["fingerprint"] != fingerprint or not verify_cleanup_token(payload.confirmation_token, fingerprint, str(job.result.get("token_digest") or "")):
        raise HTTPException(409, "数据快照已变化或一次性确认令牌无效，请重新预览")
    job.status = "queued"; job.preview_counts = preview["counts"]
    job.target_ids = preview["target_ids"]
    job.result = {**job.result, "used": True}
    db.commit(); db.refresh(job)
    background_tasks.add_task(_run_data_reset, job.id)
    return {"ok": True, "job_id": str(job.id), "status": job.status, "progress": job.progress}


@router.get("/{platform_id}/data-reset/{job_id}")
def data_reset_status(platform_id: UUID, job_id: UUID, db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)) -> dict:
    _admin(current_user)
    job = db.query(PlatformDataResetJob).filter(PlatformDataResetJob.id == job_id, PlatformDataResetJob.platform_id == platform_id, PlatformDataResetJob.project_id == current_user.project_id).first()
    if not job:
        raise HTTPException(404, "清理任务不存在")
    return {"job_id": str(job.id), "status": job.status, "progress": job.progress, "counts": job.preview_counts or {}, "result": job.result, "error": job.error, "created_at": job.created_at, "started_at": job.started_at, "completed_at": job.completed_at}


async def _run_data_reset(job_id: UUID) -> None:
    db = SessionLocal()
    try:
        job = db.get(PlatformDataResetJob, job_id)
        if not job:
            return
        if getattr(job, "operation", "platform_data_reset") == "reply_monitor_ticket_cleanup":
            db.close()
            await _run_ticket_cleanup(job_id)
            return
        if getattr(job, "operation", "") == "history_cutoff_cleanup":
            db.close()
            await _run_history_cleanup(job_id)
            return
        raise RuntimeError("无截止时间的全量清理已停用，请重新预览历史清理")
    except Exception as exc:
        db.rollback()
        job = db.get(PlatformDataResetJob, job_id)
        if job:
            job.status = "failed"; job.error = str(exc)[:500]; job.completed_at = datetime.now(timezone.utc); db.commit()
    finally:
        db.close()


async def _run_history_cleanup(job_id: UUID) -> None:
    db = SessionLocal()
    wukong_prepared = False
    database_committed = False
    rebuild_url = os.environ.get("WUKONGIM_CUTOFF_REBUILD_URL", "").rstrip("/")
    token = os.getenv("CHANNEL_DATA_MAINTENANCE_TOKEN", "")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        job = db.get(PlatformDataResetJob, job_id)
        if not job or not job.result:
            return
        platform = db.get(Platform, job.platform_id)
        cutoff = parse_cleanup_cutoff(str(job.result["cutoff_utc"]))
        if cutoff != DEFAULT_CUTOFF_UTC:
            raise RuntimeError("截止时间保护校验失败")
        job.status = "backing_up"; job.progress = 10
        job.started_at = datetime.now(timezone.utc); db.commit()
        async with httpx.AsyncClient(timeout=300) as client:
            backup = await client.post(os.environ["CHANNEL_DATA_BACKUP_URL"], json={
                "operation": "history_cutoff_cleanup", "project_id": str(job.project_id),
                "cutoff_utc": cutoff.isoformat(), "counts": job.preview_counts or {},
                "target_ids": list(job.target_ids or []),
            }, headers=headers)
            backup_data = backup.json()
            if backup.status_code >= 400 or not backup_data.get("ok"):
                raise RuntimeError("PostgreSQL 与文件备份失败，未删除任何数据")
            job.status = "rebuilding_channels"; job.progress = 35; db.commit()
            prepared = await client.post(rebuild_url, json={
                "phase": "prepare", "project_id": str(job.project_id),
                "cutoff_utc": cutoff.isoformat(), "fingerprint": job.result["fingerprint"],
            }, headers=headers)
            if prepared.status_code >= 400 or not prepared.json().get("ok"):
                raise RuntimeError("WuKongIM 导出、归档或预备回放失败，数据库保持不变")
            wukong_prepared = True

        fresh = history_cleanup_preview(db, str(job.project_id), cutoff)
        if fresh["fingerprint"] != job.result["fingerprint"]:
            raise RuntimeError("执行前数据快照变化，清理已取消")
        job.status = "deleting_database_rows"; job.progress = 60; db.commit()
        result = delete_history_before(db, str(job.project_id), cutoff)
        remaining = history_cleanup_preview(db, str(job.project_id), cutoff)
        if any(remaining["counts"].values()):
            raise RuntimeError(f"清理后仍有截止时间前数据：{remaining['counts']}")
        db.add(PlatformConnectionAudit(
            project_id=job.project_id, platform_id=job.platform_id,
            actor_staff_id=job.actor_staff_id, action="history_cutoff_cleanup",
            config_version=platform.connection_version,
            details={"backup_reference": backup_data.get("reference"), "cutoff_utc": cutoff.isoformat(), "deleted": result["deleted"]},
        ))
        db.commit(); database_committed = True

        from app.services.storage import get_storage
        storage = get_storage()
        storage_errors = []
        for storage_path in result["storage_paths"]:
            try:
                await storage.delete(storage_path)
            except Exception as exc:
                storage_errors.append({"path": storage_path, "error": type(exc).__name__})
        async with httpx.AsyncClient(timeout=300) as client:
            committed = await client.post(rebuild_url, json={
                "phase": "commit", "project_id": str(job.project_id),
                "cutoff_utc": cutoff.isoformat(), "fingerprint": job.result["fingerprint"],
            }, headers=headers)
            if committed.status_code >= 400 or not committed.json().get("ok"):
                raise RuntimeError("WuKongIM 保留消息回放校验失败，需要按备份清单恢复")
        job = db.get(PlatformDataResetJob, job_id)
        job.status = "completed"; job.progress = 100
        job.completed_at = datetime.now(timezone.utc)
        job.result = {"backup_reference": backup_data.get("reference"), "cutoff_utc": cutoff.isoformat(), "deleted": result["deleted"], "storage_delete_errors": storage_errors}
        db.commit()
    except Exception as exc:
        db.rollback()
        if wukong_prepared and not database_committed:
            try:
                async with httpx.AsyncClient(timeout=300) as client:
                    await client.post(rebuild_url, json={"phase": "rollback", "job_id": str(job_id)}, headers=headers)
            except Exception:
                pass
        job = db.get(PlatformDataResetJob, job_id)
        if job:
            job.status = "failed"; job.error = str(exc)[:500]
            job.completed_at = datetime.now(timezone.utc); db.commit()
    finally:
        db.close()


async def _run_ticket_cleanup(job_id: UUID) -> None:
    db = SessionLocal()
    try:
        job = db.get(PlatformDataResetJob, job_id)
        if not job:
            return
        platform = db.get(Platform, job.platform_id)
        target_ids = list(job.target_ids or [])
        job.status = "backing_up"; job.progress = 10
        job.started_at = datetime.now(timezone.utc); db.commit()
        token = os.getenv("CHANNEL_DATA_MAINTENANCE_TOKEN", "")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(timeout=120) as client:
            backup = await client.post(os.environ["CHANNEL_DATA_BACKUP_URL"], json={
                "operation": "reply_monitor_ticket_cleanup", "platform_id": str(platform.id),
                "ticket_ids": target_ids, "retention_days": 30,
            }, headers=headers)
        backup_data = backup.json()
        if backup.status_code >= 400 or not backup_data.get("ok"):
            raise RuntimeError("备份失败，未删除任何工单")
        job.status = "deleting_database_rows"; job.progress = 65; db.commit()
        if target_ids:
            params = {"ids": target_ids, "project_id": str(job.project_id)}
            pure_batch_ids = [str(row[0]) for row in db.execute(text("""
                SELECT b.id FROM api_reply_monitor_batches b
                WHERE b.ticket_id::text = ANY(:ids) AND NOT EXISTS (
                    SELECT 1 FROM api_reply_monitor_events e WHERE e.batch_id=b.id
                    AND e.sender_kind='customer' AND lower(coalesce(e.message_type,'text')) <> 'image'
                    AND trim(coalesce(e.content_summary,'')) NOT IN ('[图片]','【图片】','[image]')
                )
            """), params).all()]
            if pure_batch_ids:
                db.execute(text("UPDATE api_reply_monitor_events SET batch_id=NULL WHERE batch_id::text = ANY(:batch_ids)"), {"batch_ids": pure_batch_ids})
                db.execute(text("UPDATE api_reply_monitor_media SET batch_id=NULL, ticket_attachment_id=NULL WHERE batch_id::text = ANY(:batch_ids)"), {"batch_ids": pure_batch_ids})
                db.execute(text("DELETE FROM api_reply_monitor_batches WHERE id::text = ANY(:batch_ids)"), {"batch_ids": pure_batch_ids})
            deleted = db.execute(text("DELETE FROM api_tickets WHERE project_id=:project_id AND source='reply_monitor' AND id::text = ANY(:ids)"), params).rowcount or 0
        else:
            deleted = 0
        remaining = _count(db, "SELECT count(*) FROM api_tickets WHERE project_id=:project_id AND source='reply_monitor' AND id::text = ANY(:ids)", {"project_id": str(job.project_id), "ids": target_ids}) if target_ids else 0
        if remaining or deleted != len(target_ids):
            raise RuntimeError("清理数量与执行快照不一致，数据库事务已回滚")
        db.add(PlatformConnectionAudit(
            project_id=job.project_id, platform_id=job.platform_id,
            actor_staff_id=job.actor_staff_id, action="reply_monitor_ticket_cleanup",
            config_version=platform.connection_version,
            details={"backup_reference": backup_data.get("reference"), "target_ids": target_ids, "deleted": deleted},
        ))
        job.status = "completed"; job.progress = 100
        job.completed_at = datetime.now(timezone.utc)
        job.result = {"backup_reference": backup_data.get("reference"), "deleted": deleted}
        db.commit()
    except Exception as exc:
        db.rollback()
        job = db.get(PlatformDataResetJob, job_id)
        if job:
            job.status = "failed"; job.error = str(exc)[:500]
            job.completed_at = datetime.now(timezone.utc); db.commit()
    finally:
        db.close()
