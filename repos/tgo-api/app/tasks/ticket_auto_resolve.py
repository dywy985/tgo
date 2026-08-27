"""Periodic task — 工单自动解决兜底 (H8).

扫描 waiting_customer（等待客户回复）工单：超过 auto_resolve_minutes 无新消息
→ 自动 resolved（resolve_type=auto_closed），写流转历史 + 内部备注。
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logging import get_logger
from app.models import Ticket, TicketComment, TicketSettings, TicketStatusHistory

logger = get_logger("tasks.ticket_auto_resolve")

_task: Optional[asyncio.Task] = None
_processing_lock = asyncio.Lock()

DEFAULT_AUTO_RESOLVE_MINUTES = 30
CHECK_INTERVAL_SECONDS = 300  # 每 5 分钟扫一次


def _get_auto_resolve_minutes(db: Session, project_id) -> int:
    """读取设置 auto_resolve_minutes，默认 30 分钟."""
    try:
        st = db.query(TicketSettings).filter(TicketSettings.project_id == project_id).first()
        if st and st.auto_resolve_minutes and st.auto_resolve_minutes > 0:
            return st.auto_resolve_minutes
    except Exception:
        pass
    return DEFAULT_AUTO_RESOLVE_MINUTES


async def _process_auto_resolve() -> int:
    """处理超时未回复的 waiting_customer 工单，返回处理数量."""
    db: Session = SessionLocal()
    resolved_count = 0
    try:
        tickets = (
            db.query(Ticket)
            .filter(
                Ticket.status == "waiting_customer",
                Ticket.deleted_at.is_(None),
            )
            .all()
        )
        now = datetime.utcnow()
        for ticket in tickets:
            minutes = _get_auto_resolve_minutes(db, ticket.project_id)
            cutoff = now - timedelta(minutes=minutes)
            if ticket.updated_at is None or ticket.updated_at >= cutoff:
                continue

            ticket.status = "resolved"
            ticket.resolved_at = now
            if ticket.first_response_at is None:
                ticket.first_response_at = now
            ticket.resolve_type = "auto_closed"
            ticket.updated_at = now

            db.add(
                TicketStatusHistory(
                    project_id=ticket.project_id,
                    ticket_id=ticket.id,
                    from_status="waiting_customer",
                    to_status="resolved",
                    operator_type="system",
                    note="客户超过自动解决时限未回复，系统自动关闭",
                    created_at=now,
                )
            )
            db.add(
                TicketComment(
                    project_id=ticket.project_id,
                    ticket_id=ticket.id,
                    staff_id=None,
                    content=f"客户 {minutes} 分钟未回复，系统自动关闭（auto_resolve）",
                    is_internal=True,
                    created_at=now,
                )
            )
            resolved_count += 1

        if resolved_count:
            db.commit()
            logger.info("[TICKET] 自动解决 %d 个 waiting_customer 工单", resolved_count)
    except Exception as e:
        logger.error("[TICKET] 自动解决任务异常: %s", e)
        db.rollback()
    finally:
        db.close()
    return resolved_count


async def _loop() -> None:
    while True:
        try:
            async with _processing_lock:
                await _process_auto_resolve()
        except Exception as e:
            logger.error("[TICKET] auto-resolve loop error: %s", e)
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


async def start_ticket_auto_resolve_task(interval_seconds: int = CHECK_INTERVAL_SECONDS) -> None:
    """Start the periodic auto-resolve task (best-effort, called from lifespan)."""
    global _task
    if _task is not None and not _task.done():
        return
    _task = asyncio.create_task(_loop())
    logger.info("[TICKET] 自动解决任务已启动 (interval=%ss)", interval_seconds)


async def stop_ticket_auto_resolve_task() -> None:
    """Stop the periodic task."""
    global _task
    if _task is not None:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
