"""Ticket service — 工单统一创建服务（转人工自动建单 / AI 未解决自动建单复用）.

抽自 app/api/v1/endpoints/tickets.py::_generate_ticket_number，避免
internal 端点（ai_events.py）与 v1 端点循环依赖。
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Ticket

logger = logging.getLogger("services.ticket_service")


def generate_ticket_number(db: Session, project_id: UUID) -> str:
    """生成工单号 TK-YYYYMMDD-XXXX（当天序号，冲突重试）."""
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"TK-{today}-"
    for _ in range(5):
        last = (
            db.query(Ticket.number)
            .filter(Ticket.project_id == project_id, Ticket.number.like(f"{prefix}%"))
            .order_by(Ticket.number.desc())
            .first()
        )
        seq = int(last[0].split("-")[-1]) + 1 if last else 1
        number = f"{prefix}{seq:04d}"
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
    commit: bool = True,
) -> Ticket:
    """创建工单并落库.

    status/source 受数据库 CheckConstraint 约束:
      status ∈ {open, waiting_customer, pending_human, processing, resolved, closed, rejected}
      source ∈ {ai_auto, manual_service, staff_manual}
      priority ∈ {low, normal, high, urgent}
    """
    # H9: SLA 计算（按 TicketSettings.sla_timeout_minutes）
    sla_due_at = None
    try:
        from datetime import timedelta

        from app.models import TicketSettings

        settings = (
            db.query(TicketSettings)
            .filter(TicketSettings.project_id == project_id)
            .first()
        )
        if settings and settings.sla_timeout_minutes and settings.sla_timeout_minutes > 0:
            sla_due_at = datetime.utcnow() + timedelta(minutes=settings.sla_timeout_minutes)
    except Exception as e:  # noqa: BLE001
        logger.warning("[TICKET] SLA 计算失败: %s", e)

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
        sla_due_at=sla_due_at,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(ticket)
    if commit:
        db.commit()
        db.refresh(ticket)
    return ticket
