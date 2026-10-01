"""Administrator APIs for persisted WeCom identity discovery and binding."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.v1.endpoints.platform_connections import _runtime_discovered_users
from app.core.database import get_db
from app.core.security import require_admin
from app.models import Platform, PlatformConnectionAudit, Staff, WeComDiscoveredIdentity
from app.services.wecom_identity_service import (
    MATCH_FIELDS,
    get_or_create_settings,
    mark_sync_failure,
    reconcile_all,
    sync_runtime_identities,
)

router = APIRouter()


class IdentitySettingsUpdate(BaseModel):
    platform_id: UUID
    auto_bind_enabled: bool = True
    match_fields: list[Literal["name", "nickname", "username"]] = Field(min_length=1)
    existing_binding_policy: Literal["replace", "preserve"] = "replace"

    @field_validator("match_fields")
    @classmethod
    def unique_fields(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class IdentityAction(BaseModel):
    action: Literal["bind", "unbind", "ignore", "resume"]
    staff_id: UUID | None = None


def _platform(db: Session, user: Staff, platform_id: UUID | None = None) -> Platform:
    query = db.query(Platform).filter(
        Platform.project_id == user.project_id,
        Platform.type == "wecom_bot",
        Platform.deleted_at.is_(None),
    )
    if platform_id:
        query = query.filter(Platform.id == platform_id)
    else:
        query = query.filter(Platform.is_active.is_(True)).order_by(Platform.updated_at.desc())
    platform = query.first()
    if not platform:
        raise HTTPException(404, "未找到当前项目的企业微信长连接机器人")
    return platform


def _staff_summary(staff: Staff | None) -> dict | None:
    if not staff:
        return None
    return {
        "id": str(staff.id), "name": staff.name, "nickname": staff.nickname,
        "username": staff.username, "wecom_userid": staff.wecom_userid,
    }


def _overview(db: Session, platform: Platform) -> dict:
    settings = get_or_create_settings(db, platform)
    staff_rows = db.query(Staff).filter(
        Staff.project_id == platform.project_id,
        Staff.deleted_at.is_(None),
        Staff.role != "agent",
    ).order_by(Staff.created_at).all()
    staff_by_id = {row.id: row for row in staff_rows}
    identities = db.query(WeComDiscoveredIdentity).filter(
        WeComDiscoveredIdentity.project_id == platform.project_id,
        WeComDiscoveredIdentity.platform_id == platform.id,
    ).order_by(WeComDiscoveredIdentity.last_seen.desc()).all()
    counts = {
        "bound": sum(row.status in {"auto_bound", "manual_bound"} for row in identities),
        "pending": sum(row.status in {"unmatched", "superseded"} for row in identities),
        "conflict": sum(row.status in {"ambiguous", "conflict"} for row in identities),
        "missing_name": sum(row.status == "missing_name" for row in identities),
        "ignored": sum(row.status == "ignored" for row in identities),
    }
    db.commit()
    return {
        "platform": {
            "id": str(platform.id), "name": platform.name,
            "connection_state": platform.connection_state,
            "is_active": platform.is_active,
        },
        "settings": {
            "auto_bind_enabled": settings.auto_bind_enabled,
            "match_fields": settings.match_fields or list(MATCH_FIELDS),
            "existing_binding_policy": settings.existing_binding_policy,
            "last_sync_at": settings.last_sync_at,
            "last_sync_status": settings.last_sync_status,
            "last_sync_error": settings.last_sync_error,
        },
        "counts": counts,
        "identities": [{
            "id": str(row.id), "userid": row.userid, "display_name": row.display_name,
            "status": row.status, "match_field": row.match_field,
            "reason": row.match_reason, "first_seen": row.first_seen, "last_seen": row.last_seen,
            "bound_staff": _staff_summary(staff_by_id.get(row.bound_staff_id)),
            "candidates": row.match_candidates or [],
        } for row in identities],
        "staff": [_staff_summary(row) for row in staff_rows],
    }


@router.get("/overview")
def overview(
    platform_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_admin()),
) -> dict:
    return _overview(db, _platform(db, current_user, platform_id))


@router.put("/settings")
def update_settings(
    payload: IdentitySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_admin()),
) -> dict:
    platform = _platform(db, current_user, payload.platform_id)
    settings = get_or_create_settings(db, platform)
    settings.auto_bind_enabled = payload.auto_bind_enabled
    settings.match_fields = payload.match_fields
    settings.existing_binding_policy = payload.existing_binding_policy
    db.add(PlatformConnectionAudit(
        project_id=platform.project_id, platform_id=platform.id,
        actor_staff_id=current_user.id, action="wecom_identity_settings",
        config_version=platform.connection_version,
        details={
            "auto_bind_enabled": payload.auto_bind_enabled,
            "match_fields": payload.match_fields,
            "existing_binding_policy": payload.existing_binding_policy,
        },
    ))
    reconcile_all(db, platform)
    db.commit()
    return _overview(db, platform)


@router.post("/reconcile")
async def reconcile(
    platform_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_admin()),
) -> dict:
    platform = _platform(db, current_user, platform_id)
    try:
        payload = await _runtime_discovered_users(platform)
        sync_runtime_identities(db, platform, payload)
    except Exception as exc:
        db.rollback()
        mark_sync_failure(db, platform, "runtime_unreachable" if type(exc).__name__ in {"ConnectError", "ConnectTimeout"} else type(exc).__name__)
    return _overview(db, platform)


@router.patch("/{identity_id}")
def handle_identity(
    identity_id: UUID,
    payload: IdentityAction,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_admin()),
) -> dict:
    identity = db.query(WeComDiscoveredIdentity).filter(
        WeComDiscoveredIdentity.id == identity_id,
        WeComDiscoveredIdentity.project_id == current_user.project_id,
    ).first()
    if not identity:
        raise HTTPException(404, "身份记录不存在")
    platform = _platform(db, current_user, identity.platform_id)
    old_status = identity.status
    action = payload.action
    target: Staff | None = None
    if action == "bind":
        if not payload.staff_id:
            raise HTTPException(422, "人工绑定必须选择客服")
        target = db.query(Staff).filter(
            Staff.id == payload.staff_id, Staff.project_id == current_user.project_id,
            Staff.deleted_at.is_(None), Staff.role != "agent",
        ).first()
        if not target:
            raise HTTPException(404, "客服不存在")
        occupied = db.query(Staff).filter(
            Staff.project_id == current_user.project_id, Staff.deleted_at.is_(None),
            Staff.id != target.id, func.lower(Staff.wecom_userid) == identity.userid.lower(),
        ).first()
        if occupied:
            raise HTTPException(409, "该 UserID 已绑定其他客服，禁止抢占")
        old_userid = target.wecom_userid
        if old_userid and old_userid.casefold() != identity.userid.casefold():
            previous = db.query(WeComDiscoveredIdentity).filter(
                WeComDiscoveredIdentity.project_id == current_user.project_id,
                WeComDiscoveredIdentity.bound_staff_id == target.id,
                WeComDiscoveredIdentity.id != identity.id,
            ).first()
            if previous:
                previous.status = "superseded"; previous.bound_staff_id = None
                previous.match_reason = "管理员用新的 UserID 替换了此绑定"
        target.wecom_userid = identity.userid
        identity.status = "manual_bound"; identity.bound_staff_id = target.id
        identity.match_field = "manual"; identity.match_reason = "管理员人工纠正"
        identity.bound_at = datetime.now(timezone.utc)
        details = {"staff_id": str(target.id), "old_userid": old_userid, "new_userid": identity.userid}
        audit_action = "wecom_identity_manual_bound"
    elif action == "unbind":
        target = db.get(Staff, identity.bound_staff_id) if identity.bound_staff_id else None
        if target and str(target.wecom_userid or "").casefold() == identity.userid.casefold():
            target.wecom_userid = None
        identity.status = "unmatched"; identity.bound_staff_id = None
        identity.bound_at = None; identity.match_field = None; identity.match_reason = "管理员已解绑"
        details = {"staff_id": str(target.id) if target else None, "old_userid": identity.userid, "new_userid": None}
        audit_action = "wecom_identity_unbound"
    elif action == "ignore":
        if identity.bound_staff_id:
            raise HTTPException(409, "请先解绑，再忽略该身份")
        identity.status = "ignored"; identity.match_reason = "管理员已忽略"
        details = {"previous_status": old_status}; audit_action = "wecom_identity_ignored"
    else:
        identity.status = "unmatched"; identity.match_reason = "管理员恢复待匹配"
        details = {"previous_status": old_status}; audit_action = "wecom_identity_resumed"
    identity.last_attempt_at = datetime.now(timezone.utc)
    db.add(PlatformConnectionAudit(
        project_id=platform.project_id, platform_id=platform.id,
        actor_staff_id=current_user.id, action=audit_action,
        config_version=platform.connection_version,
        details={"identity_id": str(identity.id), "userid": identity.userid, **details},
    ))
    db.commit()
    return _overview(db, platform)
