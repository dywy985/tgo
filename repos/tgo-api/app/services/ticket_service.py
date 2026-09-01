"""Ticket service — 工单统一创建服务（转人工自动建单 / AI 未解决自动建单复用）.

抽自 app/api/v1/endpoints/tickets.py::_generate_ticket_number，避免
internal 端点（ai_events.py）与 v1 端点循环依赖。
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Ticket

logger = logging.getLogger("services.ticket_service")


def generate_ticket_number(
    db: Session, project_id: UUID, number_format: Optional[Dict[str, Any]] = None
) -> str:
    """生成工单号，格式可配置：{prefix:'TK-', date:true, seq_digits:4}.

    date=true  → TK-20260828-0001（当天序号）
    date=false → TK-0001（全项目序号）
    """
    fmt = number_format or {"prefix": "TK-", "date": True, "seq_digits": 4}
    prefix = fmt.get("prefix") or "TK-"
    seq_digits = int(fmt.get("seq_digits") or 4)
    use_date = bool(fmt.get("date", True))

    today = datetime.utcnow().strftime("%Y%m%d")
    if use_date:
        base_prefix = f"{prefix}{today}-"
    else:
        base_prefix = prefix

    for _ in range(5):
        last = (
            db.query(Ticket.number)
            .filter(Ticket.project_id == project_id, Ticket.number.like(f"{base_prefix}%"))
            .order_by(Ticket.number.desc())
            .first()
        )
        seq = int(last[0].split("-")[-1]) + 1 if last else 1
        number = f"{base_prefix}{seq:0{seq_digits}d}"
        exists = (
            db.query(Ticket.id)
            .filter(Ticket.project_id == project_id, Ticket.number == number)
            .first()
        )
        if not exists:
            return number
    raise HTTPException(status_code=500, detail="Failed to generate ticket number")


def create_ticket(
    db: Session,
    *,
    project_id: UUID,
    title: str,
    description: str,
    category: str = "其他",
    priority: str = "normal",
    source: str = "staff_manual",
    status: str = "open",
    visitor_id: Optional[UUID] = None,
    session_id: Optional[UUID] = None,
    platform_id: Optional[UUID] = None,
    group_key: Optional[str] = None,
    agent_id: Optional[UUID] = None,
    assignee_id: Optional[UUID] = None,
    ai_summary: Optional[Dict[str, Any]] = None,
    custom_fields: Optional[Dict[str, Any]] = None,
    contact_name: Optional[str] = None,
    contact_phone: Optional[str] = None,
    ai_fields: Optional[Dict[str, Any]] = None,
    last_ticket_enabled: bool = False,
    commit: bool = True,
) -> Ticket:
    """创建工单并落库.

    自动填写：ai_fields（AI 显式结构化字段）+ 表单模板规则（ticket_autofill_service）
    优先级：显式传入参数 > ai_fields > 自动规则 > 默认值

    status/source 受数据库 CheckConstraint 约束:
      status ∈ {open, waiting_customer, pending_human, processing, resolved, closed, rejected}
      source ∈ {ai_auto, manual_service, staff_manual}
      priority ∈ {low, normal, high, urgent}
    """
    # H9: SLA 计算（按优先级分级，缺省回退单一 sla_timeout_minutes）
    sla_due_at = None
    try:
        from app.services.ticket_autofill_service import sla_minutes_for

        minutes = sla_minutes_for(db, project_id, priority)
        if minutes and minutes > 0:
            sla_due_at = datetime.utcnow() + timedelta(minutes=minutes)
    except Exception as e:  # noqa: BLE001
        logger.warning("[TICKET] SLA 计算失败: %s", e)

    # 自动填写：ai_fields + 表单模板规则（不覆盖显式传入）
    # 合并优先级：AI 强值 > 显式参数 > auto 规则/fallback
    try:
        from app.services.ticket_autofill_service import build_ticket_fields

        auto = build_ticket_fields(
            db,
            project_id=project_id,
            visitor_id=visitor_id,
            session_id=session_id,
            platform_id=platform_id,
            group_key=group_key,
            ai_fields=ai_fields,
            last_ticket_enabled=last_ticket_enabled,
        )
        ai_strong = auto.pop("_ai_strong", {}) or {}
        title = ai_strong.get("title") or title or auto.get("title") or ""
        description = ai_strong.get("description") or description or auto.get("description") or ""
        category = ai_strong.get("category") or category or auto.get("category") or "其他"
        priority = ai_strong.get("priority") or priority or auto.get("priority") or "normal"
        group_key = ai_strong.get("group_key") or group_key or auto.get("group_key")
        if auto.get("custom_fields"):
            custom_fields = {**(custom_fields or {}), **auto["custom_fields"]}
        auto_summary = auto.get("ai_summary")
        if auto_summary:
            merged = dict(ai_summary or {})
            merged.update(auto_summary)
            ai_summary = merged
    except Exception as e:  # noqa: BLE001
        logger.warning("[TICKET] 自动填写失败(降级为显式值): %s", e)

    ticket = Ticket(
        project_id=project_id,
        number=generate_ticket_number(db, project_id),
        title=(title or "")[:120],
        description=description or "",
        category=category or "其他",
        priority=priority,
        source=source,
        status=status,
        visitor_id=visitor_id,
        session_id=session_id,
        platform_id=platform_id,
        group_key=group_key,
        agent_id=agent_id,
        assignee_id=assignee_id,
        ai_summary=ai_summary,
        custom_fields=custom_fields,
        contact_name=contact_name,
        contact_phone=contact_phone,
        sla_due_at=sla_due_at,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(ticket)
    if commit:
        db.commit()
        db.refresh(ticket)
    return ticket
