"""AI Runs helper endpoints (cancel by client_msg_no)."""
from __future__ import annotations

from typing import Optional, Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models import Platform, Staff
from app.services.ai_client import ai_client
from app.services.run_registry import run_registry

logger = get_logger("endpoints.ai_runs")
router = APIRouter()


class CancelByClientNoRequest(BaseModel):
    """Request body for visitor-facing cancel endpoint (platform API key auth)."""
    platform_api_key: str = Field(..., description="Platform API key (visitor-facing authentication)")
    client_msg_no: str = Field(..., description="Correlation ID used in streaming, i.e., client_msg_no")
    reason: Optional[str] = Field(None, description="Optional reason for cancellation (for auditing)")


class StaffCancelRequest(BaseModel):
    """Request body for staff-facing cancel endpoint (JWT auth)."""
    client_msg_no: str = Field(..., description="Correlation ID used in streaming, i.e., client_msg_no")
    reason: Optional[str] = Field(None, description="Optional reason for cancellation (for auditing)")


@router.post(
    "/cancel-by-client",
    status_code=202,
    summary="Cancel Supervisor Run by client_msg_no",
    description=(
        "Cancel a running supervisor agent execution by client_msg_no. "
        "If the run has not yet started (run_id unknown), the cancellation will be queued and sent immediately on start."
    ),
)
async def cancel_by_client_no(
    req: CancelByClientNoRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    # Authenticate via platform_api_key (visitor-facing)
    platform = (
        db.query(Platform)
        .filter(
            Platform.api_key == req.platform_api_key,
            Platform.is_active.is_(True),
            Platform.deleted_at.is_(None),
        )
        .first()
    )
    if not platform:
        raise HTTPException(status_code=401, detail="Invalid platform API key")

    # Look up mapping
    entry = await run_registry.get(req.client_msg_no)
    

    # Enforce project isolation if we have a project_id recorded
    if entry is not None and entry.project_id and str(entry.project_id) != str(platform.project_id):
        # Do not leak existence
        raise HTTPException(status_code=404, detail="Run not found for current project")

    # Determine project_id to forward if immediate cancel
    forward_project_id: Optional[str] = None
    if entry and entry.run_id:
        forward_project_id = entry.project_id or str(platform.project_id)
        if not forward_project_id:
            raise HTTPException(status_code=500, detail="Missing project_id for cancellation")

        # Run started; cancel immediately
        print("Cancel-by-client: immediate cancel --> ",entry.run_id)
        try:
            await ai_client.cancel_supervisor_run(
                project_id=forward_project_id,
                run_id=entry.run_id,
                reason=req.reason,
            )
        except HTTPException as e:
            # Upstream generally returns 202 even if already finished; propagate other errors
            logger.warning(
                "Cancel-by-client encountered upstream error",
                extra={"client_msg_no": req.client_msg_no, "status_code": e.status_code, "detail": e.detail},
            )
            raise
        return {"accepted": True, "status": "sent", "client_msg_no": req.client_msg_no}

    # Not started yet or no entry: mark pending so ai_processor can cancel when run_id arrives
    await run_registry.mark_cancel_pending(
        req.client_msg_no,
        reason=req.reason,
        project_id=str(platform.project_id),
        api_key=None,
    )
    return {"accepted": True, "status": "pending", "client_msg_no": req.client_msg_no}


@router.post(
    "/cancel",
    status_code=202,
    summary="Cancel Supervisor Run by client_msg_no (Staff)",
    description=(
        "Cancel a running supervisor agent execution by client_msg_no. "
        "This endpoint is for staff (customer service agents) and requires JWT authentication. "
        "If the run has not yet started (run_id unknown), the cancellation will be queued and sent immediately on start."
    ),
)
async def cancel_run_by_staff(
    req: StaffCancelRequest,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Cancel AI run - staff version with JWT authentication."""

    # Look up mapping
    entry = await run_registry.get(req.client_msg_no)

    # Enforce project isolation if we have a project_id recorded
    if entry is not None and entry.project_id and str(entry.project_id) != str(current_user.project_id):
        # Do not leak existence
        raise HTTPException(status_code=404, detail="Run not found for current project")

    # Determine project_id to forward if immediate cancel
    forward_project_id: Optional[str] = None
    if entry and entry.run_id:
        forward_project_id = entry.project_id or str(current_user.project_id)
        if not forward_project_id:
            raise HTTPException(status_code=500, detail="Missing project_id for cancellation")

        # Run started; cancel immediately
        logger.info(
            "Staff cancel: immediate cancel",
            extra={
                "client_msg_no": req.client_msg_no,
                "run_id": entry.run_id,
                "staff_id": str(current_user.id),
                "username": current_user.username,
            },
        )
        try:
            await ai_client.cancel_supervisor_run(
                project_id=forward_project_id,
                run_id=entry.run_id,
                reason=req.reason,
            )
        except HTTPException as e:
            # Upstream generally returns 202 even if already finished; propagate other errors
            logger.warning(
                "Staff cancel encountered upstream error",
                extra={
                    "client_msg_no": req.client_msg_no,
                    "status_code": e.status_code,
                    "detail": e.detail,
                },
            )
            raise
        return {"accepted": True, "status": "sent", "client_msg_no": req.client_msg_no}

    # Not started yet or no entry: mark pending so ai_processor can cancel when run_id arrives
    logger.info(
        "Staff cancel: marking pending",
        extra={
            "client_msg_no": req.client_msg_no,
            "staff_id": str(current_user.id),
            "username": current_user.username,
        },
    )
    await run_registry.mark_cancel_pending(
        req.client_msg_no,
        reason=req.reason,
        project_id=str(current_user.project_id),
        api_key=None,
    )
    return {"accepted": True, "status": "pending", "client_msg_no": req.client_msg_no}
