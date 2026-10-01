"""Deprecated legacy ticket command endpoint."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
router = APIRouter()


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
    """旧“#完成”流程已停用，真实客服消息会自动完成回复流转。"""
    raise HTTPException(
        status_code=410,
        detail="工单完成指令已停用；客服真实回复后系统会自动标记为已回复",
    )
