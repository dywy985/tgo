"""Safe exact matching for WeCom private-chat identities."""

from __future__ import annotations

from datetime import datetime, timezone
import re
import unicodedata
from typing import Iterable
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Platform,
    PlatformConnectionAudit,
    Staff,
    WeComDiscoveredIdentity,
    WeComIdentitySettings,
)

MATCH_FIELDS = ("name", "nickname", "username")
FINAL_BOUND_STATUSES = {"auto_bound", "manual_bound"}


def normalize_identity(value: object) -> str:
    """NFKC + whitespace folding + Unicode case folding."""
    normalized = unicodedata.normalize("NFKC", str(value or ""))
    return re.sub(r"\s+", "", normalized).casefold()


def find_unique_staff_match(
    display_name: object, staff_rows: Iterable[Staff], match_fields: Iterable[str]
) -> tuple[Staff | None, str | None, list[dict[str, str]]]:
    needle = normalize_identity(display_name)
    if not needle:
        return None, None, []
    fields = [field for field in match_fields if field in MATCH_FIELDS]
    matches: dict[str, tuple[Staff, set[str]]] = {}
    for staff in staff_rows:
        hit_fields = {field for field in fields if normalize_identity(getattr(staff, field, None)) == needle}
        if hit_fields:
            matches[str(staff.id)] = (staff, hit_fields)
    candidates = [
        {
            "staff_id": key,
            "name": staff.nickname or staff.name or staff.username,
            "fields": ",".join(sorted(hit_fields)),
        }
        for key, (staff, hit_fields) in matches.items()
    ]
    if len(matches) != 1:
        return None, None, candidates
    staff, hit_fields = next(iter(matches.values()))
    return staff, sorted(hit_fields)[0], candidates


def get_or_create_settings(db: Session, platform: Platform) -> WeComIdentitySettings:
    settings = db.get(WeComIdentitySettings, platform.id)
    if settings is None:
        settings = WeComIdentitySettings(project_id=platform.project_id, platform_id=platform.id)
        db.add(settings)
        db.flush()
    return settings


def _audit(
    db: Session,
    platform: Platform,
    action: str,
    identity: WeComDiscoveredIdentity,
    *,
    actor_staff_id: UUID | None = None,
    details: dict | None = None,
) -> None:
    db.add(PlatformConnectionAudit(
        project_id=platform.project_id,
        platform_id=platform.id,
        actor_staff_id=actor_staff_id,
        action=action,
        config_version=platform.connection_version,
        details={"identity_id": str(identity.id), "userid": identity.userid, **(details or {})},
    ))


def _set_result(
    identity: WeComDiscoveredIdentity,
    status: str,
    reason: str,
    *,
    staff: Staff | None = None,
    field: str | None = None,
    candidates: list[dict[str, str]] | None = None,
) -> None:
    identity.status = status
    identity.match_reason = reason
    identity.bound_staff_id = staff.id if staff else None
    identity.match_field = field
    identity.match_candidates = candidates or []
    identity.last_attempt_at = datetime.now(timezone.utc)
    identity.bound_at = datetime.now(timezone.utc) if status in FINAL_BOUND_STATUSES else None


def reconcile_identity(
    db: Session,
    platform: Platform,
    identity: WeComDiscoveredIdentity,
    settings: WeComIdentitySettings,
) -> None:
    if identity.status == "ignored":
        return
    if identity.status == "manual_bound" and identity.bound_staff_id:
        manually_bound = db.get(Staff, identity.bound_staff_id)
        if manually_bound and normalize_identity(manually_bound.wecom_userid) == identity.normalized_userid:
            identity.last_attempt_at = datetime.now(timezone.utc)
            identity.match_reason = "管理员人工绑定，自动匹配不覆盖"
            return
    if not settings.auto_bind_enabled and identity.status in FINAL_BOUND_STATUSES:
        identity.last_attempt_at = datetime.now(timezone.utc)
        identity.match_reason = "自动绑定已关闭，保留现有绑定"
        return
    if not identity.normalized_display_name:
        _set_result(identity, "missing_name", "机器人事件未提供显示姓名")
        return
    staff_rows = db.query(Staff).filter(
        Staff.project_id == platform.project_id,
        Staff.deleted_at.is_(None),
        Staff.is_active.is_(True),
        Staff.role != "agent",
    ).all()
    target, field, candidates = find_unique_staff_match(
        identity.display_name, staff_rows, settings.match_fields or []
    )
    if target is None:
        if candidates:
            previous = identity.status
            _set_result(identity, "ambiguous", "规范化姓名命中多名客服", candidates=candidates)
            if previous != "ambiguous":
                _audit(db, platform, "wecom_identity_conflict", identity, details={"reason": "ambiguous", "candidate_count": len(candidates)})
        else:
            _set_result(identity, "unmatched", "未找到规范化后完全一致的客服")
        return
    if not settings.auto_bind_enabled:
        _set_result(identity, "unmatched", "自动绑定已关闭", staff=target, field=field, candidates=candidates)
        return
    occupied = db.query(Staff).filter(
        Staff.project_id == platform.project_id,
        Staff.deleted_at.is_(None),
        Staff.id != target.id,
        func.lower(Staff.wecom_userid) == identity.userid.lower(),
    ).first()
    if occupied:
        previous = identity.status
        _set_result(identity, "conflict", "该 UserID 已被另一名客服占用", candidates=[{
            "staff_id": str(occupied.id), "name": occupied.nickname or occupied.name or occupied.username,
            "fields": "wecom_userid",
        }])
        if previous != "conflict":
            _audit(db, platform, "wecom_identity_conflict", identity, details={"reason": "userid_occupied", "staff_id": str(occupied.id)})
        return
    old_userid = str(target.wecom_userid or "").strip()
    old_identity = None
    if old_userid and old_userid.casefold() != identity.userid.casefold():
        old_identity = db.query(WeComDiscoveredIdentity).filter(
            WeComDiscoveredIdentity.project_id == platform.project_id,
            WeComDiscoveredIdentity.bound_staff_id == target.id,
            WeComDiscoveredIdentity.id != identity.id,
        ).first()
        if old_identity and old_identity.last_seen >= identity.last_seen:
            _set_result(identity, "superseded", "该客服已有更新的身份发现记录", staff=None, field=field, candidates=candidates)
            return
    if old_userid and old_userid.casefold() != identity.userid.casefold() and settings.existing_binding_policy != "replace":
        _set_result(identity, "conflict", "匹配客服已有绑定，当前策略不允许替换", staff=target, field=field, candidates=candidates)
        return
    already_bound = old_userid.casefold() == identity.userid.casefold() and identity.status in FINAL_BOUND_STATUSES
    if already_bound:
        identity.bound_staff_id = target.id
        identity.match_field = field
        identity.match_reason = "绑定仍有效"
        identity.last_attempt_at = datetime.now(timezone.utc)
        return
    if old_userid and old_userid.casefold() != identity.userid.casefold():
        if old_identity:
            _set_result(old_identity, "superseded", "客服绑定已被新发现的唯一匹配替换")
    target.wecom_userid = identity.userid
    _set_result(identity, "auto_bound", "显示姓名唯一精确匹配", staff=target, field=field, candidates=candidates)
    _audit(
        db, platform,
        "wecom_identity_replaced" if old_userid else "wecom_identity_auto_bound",
        identity,
        details={"staff_id": str(target.id), "old_userid": old_userid or None, "new_userid": identity.userid, "match_field": field},
    )


def reconcile_all(db: Session, platform: Platform) -> int:
    settings = get_or_create_settings(db, platform)
    rows = db.query(WeComDiscoveredIdentity).filter(
        WeComDiscoveredIdentity.project_id == platform.project_id,
        WeComDiscoveredIdentity.platform_id == platform.id,
    ).all()
    for identity in rows:
        reconcile_identity(db, platform, identity, settings)
    return len(rows)


def _timestamp(value: object, fallback: datetime) -> datetime:
    try:
        return datetime.fromtimestamp(float(value), timezone.utc)
    except (TypeError, ValueError, OSError):
        return fallback


def sync_runtime_identities(db: Session, platform: Platform, payload: dict) -> int:
    if str(payload.get("platform_id") or "") != str(platform.id):
        raise ValueError("runtime platform_id mismatch")
    settings = get_or_create_settings(db, platform)
    now = datetime.now(timezone.utc)
    count = 0
    # Process older sightings first so the latest identity wins without
    # oscillating on every 30-second synchronization.
    items = sorted(payload.get("users") or [], key=lambda row: float(row.get("last_seen") or 0))
    for item in items:
        userid = str(item.get("userid") or "").strip()[:128]
        normalized_userid = normalize_identity(userid)
        if not normalized_userid:
            continue
        display_name = str(item.get("display_name") or "").strip()[:255] or None
        identity = db.query(WeComDiscoveredIdentity).filter(
            WeComDiscoveredIdentity.platform_id == platform.id,
            WeComDiscoveredIdentity.normalized_userid == normalized_userid,
        ).first()
        if identity is None:
            identity = WeComDiscoveredIdentity(
                project_id=platform.project_id,
                platform_id=platform.id,
                userid=userid,
                normalized_userid=normalized_userid,
                display_name=display_name,
                normalized_display_name=normalize_identity(display_name) or None,
                first_seen=_timestamp(item.get("first_seen"), now),
                last_seen=_timestamp(item.get("last_seen"), now),
            )
            db.add(identity)
            db.flush()
        else:
            identity.userid = userid
            if display_name:
                identity.display_name = display_name
                identity.normalized_display_name = normalize_identity(display_name)
            identity.first_seen = min(identity.first_seen, _timestamp(item.get("first_seen"), identity.first_seen))
            identity.last_seen = max(identity.last_seen, _timestamp(item.get("last_seen"), identity.last_seen))
        reconcile_identity(db, platform, identity, settings)
        count += 1
    settings.last_sync_at = now
    settings.last_sync_status = "ok"
    settings.last_sync_error = None
    db.commit()
    return count


def mark_sync_failure(db: Session, platform: Platform, reason: str) -> None:
    settings = get_or_create_settings(db, platform)
    settings.last_sync_at = datetime.now(timezone.utc)
    settings.last_sync_status = "offline" if reason == "runtime_unreachable" else "error"
    settings.last_sync_error = reason[:200]
    db.commit()
