"""Ticket autofill service — 工单自动填写（按表单模板规则 + 数据源组装字段值）.

数据源优先级：AI 显式传入(ai_fields) > auto_fill 规则查表 > 空
auto_fill.source 支持的取值：
  - ai_fields.<key>            AI 事件显式传入（title/description/category/priority/group_key/custom_fields.*）
  - visitor.<field>            访客表字段：name/nickname/phone_number/email/company/job_title/source
  - visitor.custom_attributes.<key>  访客自定义属性
  - session.<field>            会话表字段：created_at/message_count/status/duration_seconds
  - platform.<field>           平台表字段：type/name
  - last_ticket.<field>        该访客最近工单字段（默认关闭，需设置开启 last_ticket_enabled）
  - const:<value>              固定值
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Ticket, TicketSettings

logger = logging.getLogger("services.ticket_autofill_service")

# 内置字段（写到 Ticket 列上）；其余 key 归入 custom_fields
BUILTIN_FIELDS = {"title", "description", "category", "priority", "assignee_id", "visitor_id", "group_key"}

# 访客表可映射字段白名单
_VISITOR_FIELDS = {
    "name", "nickname", "phone_number", "email", "company", "job_title", "source",
}
_SESSION_FIELDS = {"created_at", "message_count", "status", "duration_seconds"}
_PLATFORM_FIELDS = {"type", "name"}


def get_form_schema(db: Session, project_id: UUID) -> list:
    """读取项目表单模板（无则默认内置 7 字段）。"""
    settings = db.query(TicketSettings).filter(TicketSettings.project_id == project_id).first()
    return settings.form_schema_list if settings else []


def resolve_autofill(
    source: str,
    *,
    visitor: Any = None,
    session: Any = None,
    platform: Any = None,
    last_ticket: Any = None,
) -> Any:
    """按 source 取值。取不到返回 None。"""
    if not source:
        return None
    if source.startswith("const:"):
        return source[len("const:"):]
    if source.startswith("ai_fields."):
        # ai_fields 由调用方在 build 时注入，这里直接返回占位标记由调用方解析
        return ("__ai_fields__", source[len("ai_fields."):])
    if source.startswith("visitor.custom_attributes."):
        key = source[len("visitor.custom_attributes."):]
        if visitor:
            return (visitor.custom_attributes or {}).get(key)
        return None
    if source.startswith("visitor."):
        f = source[len("visitor."):]
        if f in _VISITOR_FIELDS and visitor:
            return getattr(visitor, f, None)
        return None
    if source.startswith("session."):
        f = source[len("session."):]
        if f in _SESSION_FIELDS and session:
            val = getattr(session, f, None)
            if isinstance(val, datetime):
                return val.isoformat()
            return val
        return None
    if source.startswith("platform."):
        f = source[len("platform."):]
        if f in _PLATFORM_FIELDS and platform:
            return getattr(platform, f, None)
        return None
    if source.startswith("last_ticket."):
        f = source[len("last_ticket."):]
        if last_ticket:
            if f in BUILTIN_FIELDS:
                return getattr(last_ticket, f, None)
            return (last_ticket.custom_fields or {}).get(f)
        return None
    logger.warning("[TICKET] 未知 auto_fill source: %s", source)
    return None


def build_ticket_fields(
    db: Session,
    *,
    project_id: UUID,
    visitor_id: Optional[UUID] = None,
    session_id: Optional[UUID] = None,
    platform_id: Optional[UUID] = None,
    group_key: Optional[str] = None,
    ai_fields: Optional[Dict[str, Any]] = None,
    last_ticket_enabled: bool = False,
) -> Dict[str, Any]:
    """按表单模板规则组装工单初始字段值。

    返回 dict：{title, description, category, priority, group_key, custom_fields, ai_summary}
    - ai_fields: AI 事件显式传入（最高优先级）
    - 未命中规则的字段不填（交给调用方默认值）
    - ai_summary.autofill 记录每个字段的来源（审计）
    """
    ai_fields = dict(ai_fields or {})
    ai_custom = dict(ai_fields.pop("custom_fields", None) or {})
    ai_strong: Dict[str, Any] = {}  # AI 显式强值（create_ticket 优先采用）

    # 懒加载关联对象
    visitor = session_obj = platform_obj = None
    from app.models import Visitor, VisitorSession, Platform

    if visitor_id:
        visitor = db.query(Visitor).filter(Visitor.id == visitor_id, Visitor.deleted_at.is_(None)).first()
    if session_id:
        session_obj = db.query(VisitorSession).filter(VisitorSession.id == session_id).first()
    if platform_id:
        platform_obj = db.query(Platform).filter(Platform.id == platform_id).first()

    # 上次工单（默认关闭，last_ticket_enabled=True 时启用）
    last_ticket = None
    if last_ticket_enabled and visitor_id:
        last_ticket = (
            db.query(Ticket)
            .filter(Ticket.project_id == project_id, Ticket.visitor_id == visitor_id, Ticket.deleted_at.is_(None))
            .order_by(Ticket.created_at.desc())
            .first()
        )

    schema = get_form_schema(db, project_id)
    result: Dict[str, Any] = {}
    custom_values: Dict[str, Any] = {}
    autofill_trace: Dict[str, Dict[str, Any]] = {}

    for field_def in schema:
        key = field_def.get("key", "")
        if not key:
            continue
        rule = field_def.get("auto_fill")
        if not rule or not isinstance(rule, dict):
            continue
        source = rule.get("source", "")
        fallback = rule.get("fallback")

        # 1) AI 显式传入
        ai_val = ai_fields.get(key)
        if ai_val is not None and ai_val != "":
            if key in BUILTIN_FIELDS:
                result[key] = ai_val
            else:
                custom_values[key] = ai_val
            ai_strong[key] = ai_val
            autofill_trace[key] = {"source": "ai_fields", "value": ai_val}
            continue

        # 2) 规则查表
        raw = resolve_autofill(
            source,
            visitor=visitor,
            session=session_obj,
            platform=platform_obj,
            last_ticket=last_ticket,
        )
        if isinstance(raw, tuple) and raw and raw[0] == "__ai_fields__":
            # ai_fields.<x> 但 AI 没传 → 回退
            val = None
        else:
            val = raw

        # 3) fallback
        if val is None or val == "":
            val = fallback
        if val is None or val == "":
            continue

        if key in BUILTIN_FIELDS:
            result[key] = val
        else:
            custom_values[key] = val
        autofill_trace[key] = {"source": source, "value": val}

    if ai_custom:
        for k, v in ai_custom.items():
            if v is None or v == "":
                continue
            custom_values[k] = v
            autofill_trace.setdefault(k, {"source": "ai_fields.custom_fields", "value": v})

    if custom_values:
        result["custom_fields"] = custom_values
    if autofill_trace:
        result["ai_summary"] = {"autofill": autofill_trace}
    result["_ai_strong"] = ai_strong  # 内部元数据：AI 显式强值（create_ticket 消费后剔除）
    return result


def sla_minutes_for(db: Session, project_id: UUID, priority: str) -> int:
    """按优先级取 SLA 时限（分钟）。"""
    try:
        settings = db.query(TicketSettings).filter(TicketSettings.project_id == project_id).first()
        if settings:
            return settings.sla_by_priority_dict.get(priority, settings.sla_timeout_minutes)
    except Exception as e:  # noqa: BLE001
        logger.warning("[TICKET] SLA 分级读取失败: %s", e)
    return 15
