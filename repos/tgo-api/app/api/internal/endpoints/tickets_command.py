"""Internal ticket command endpoint — 客服指令回执（#完成 TK-xxx）.

由 tgo-platform 在收到客服本人消息时调用（无 JWT，内网 8001）。
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Ticket

logger = logging.getLogger("internal.tickets_command")
router = APIRouter()

# resolved 允许的进入状态（对齐 TICKET_STATUS_TRANSITIONS）
RESOLVABLE_STATUSES = {"open", "pending_human", "processing"}


class TicketCommandRequest(BaseModel):
    """工单指令请求体."""

    number: str = Field(..., description="工单号 TK-YYYYMMDD-XXXX")
    action: str = Field("complete", description="complete=标记解决")
    note: Optional[str] = Field(None, description="备注（写入工单说明）")
    operator: Optional[str] = Field(None, description="操作人标识（客服 userid/昵称）")


@router.post("", summary="处理客服指令（#完成 TK-xxx）")
async def ticket_command(
    req: TicketCommandRequest,
    db: Session = Depends(get_db),
) -> dict:
    """按工单号将未完结工单标记为 resolved（human_resolved）。"""
    number = (req.number or "").strip()
    if not number:
        raise HTTPException(status_code=400, detail="number is required")

    ticket = (
        db.query(Ticket)
        .filter(Ticket.number == number, Ticket.deleted_at.is_(None))
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail=f"Ticket {number} not found")

    if req.action == "complete":
        if ticket.status in ("resolved", "closed"):
            return {
                "ok": True,
                "number": ticket.number,
                "status": ticket.status,
                "message": f"工单已处于 {ticket.status} 状态",
            }
        if ticket.status not in RESOLVABLE_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Ticket {number} 当前状态 {ticket.status} 不可标记解决",
            )

        now = datetime.utcnow()
        ticket.status = "resolved"
        ticket.resolved_at = now
        if ticket.first_response_at is None:
            ticket.first_response_at = now
        ticket.resolve_type = "human_resolved"
        ticket.updated_at = now

        if req.note:
            from app.models import TicketComment

            db.add(
                TicketComment(
                    project_id=ticket.project_id,
                    ticket_id=ticket.id,
                    staff_id=None,
                    content=req.note,
                    is_internal=True,
                    created_at=now,
                )
            )

        db.commit()
        logger.info("[TICKET] 指令回执: %s -> resolved (operator=%s)", number, req.operator)
        return {"ok": True, "number": ticket.number, "status": "resolved"}

    raise HTTPException(status_code=400, detail=f"Unsupported action: {req.action}")
