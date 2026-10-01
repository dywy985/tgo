from __future__ import annotations

import io
import time
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Platform, Project, TicketAttachment, TicketStatusHistory
from app.services.public_ticket_form import render_public_ticket_form
from app.services.public_ticket_submission import (
    MAX_IMAGE_BYTES,
    normalize_public_ticket_fields,
)
from app.services.reply_monitor_media_service import sanitize_image
from app.services.public_ticket_token import (
    InvalidPublicTicketToken,
    decode_public_ticket_token,
    issue_public_ticket_token,
)
from app.services.storage import get_storage
from app.services.ticket_service import create_ticket


router = APIRouter()


class PublicTicketLinkRequest(BaseModel):
    visitor_id: Optional[UUID] = None
    group_key: Optional[str] = Field(None, max_length=255)
    expires_in_seconds: int = Field(86400, ge=300, le=604800)


def _decode_context(token: str) -> dict:
    try:
        return decode_public_ticket_token(token, secret=settings.SECRET_KEY)
    except InvalidPublicTicketToken as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工单链接无效或已过期") from exc


@router.post("/links")
async def create_public_ticket_link(
    payload: PublicTicketLinkRequest,
    x_platform_api_key: str = Header(..., alias="X-Platform-API-Key"),
    db: Session = Depends(get_db),
) -> dict:
    """Issue a short-lived customer form URL for a trusted platform adapter."""
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="公开工单入口已停用")
    platform = (
        db.query(Platform)
        .filter(Platform.api_key == x_platform_api_key, Platform.deleted_at.is_(None))
        .first()
    )
    if platform is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid platform API key")

    token = issue_public_ticket_token(
        secret=settings.SECRET_KEY,
        project_id=str(platform.project_id),
        visitor_id=str(payload.visitor_id) if payload.visitor_id else None,
        platform_id=str(platform.id),
        group_key=payload.group_key,
        expires_at=int(time.time()) + payload.expires_in_seconds,
    )
    path = f"/api/v1/public-tickets/{token}"
    return {"url": settings.PUBLIC_APP_URL.rstrip("/") + path, "path": path, "expires_in_seconds": payload.expires_in_seconds}


@router.get("/{token}", response_class=HTMLResponse)
async def public_ticket_form(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="公开工单入口已停用")
    context = _decode_context(token)
    try:
        project_id = UUID(context["project_id"])
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=404, detail="工单链接无效") from exc
    if db.query(Project.id).filter(Project.id == project_id).first() is None:
        raise HTTPException(status_code=404, detail="工单链接无效")
    return HTMLResponse(render_public_ticket_form(token))


@router.post("/{token}", response_class=HTMLResponse)
async def submit_public_ticket(
    token: str,
    title: str = Form(...),
    description: str = Form(...),
    contact_name: str = Form(...),
    contact_phone: str = Form(...),
    images: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
) -> HTMLResponse:
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="公开工单入口已停用")
    context = _decode_context(token)
    try:
        project_id = UUID(context["project_id"])
        visitor_id = UUID(context["visitor_id"]) if context.get("visitor_id") else None
        platform_id = UUID(context["platform_id"]) if context.get("platform_id") else None
        fields = normalize_public_ticket_fields(
            title=title,
            description=description,
            contact_name=contact_name,
            contact_phone=contact_phone,
        )
    except (ValueError, TypeError) as exc:
        return HTMLResponse(render_public_ticket_form(token, error=str(exc)), status_code=400)

    upload_files = [item for item in (images or []) if item.filename]
    if len(upload_files) > 5:
        return HTMLResponse(render_public_ticket_form(token, error="最多上传 5 张图片"), status_code=400)
    if db.query(Project.id).filter(Project.id == project_id).first() is None:
        raise HTTPException(status_code=404, detail="工单链接无效")

    prepared = []
    try:
        for uploaded in upload_files:
            content = await uploaded.read(MAX_IMAGE_BYTES + 1)
            image = sanitize_image(
                content, uploaded.content_type or "", uploaded.filename or "image"
            )
            prepared.append(image)
    except ValueError as exc:
        return HTMLResponse(render_public_ticket_form(token, error=str(exc)), status_code=400)

    storage = get_storage()
    stored_paths: List[str] = []
    try:
        ticket = create_ticket(
            db,
            project_id=project_id,
            title=fields["title"],
            description=fields["description"],
            source="public_form",
            visitor_id=visitor_id,
            platform_id=platform_id,
            group_key=context.get("group_key"),
            contact_name=fields["contact_name"],
            contact_phone=fields["contact_phone"],
            commit=False,
        )
        db.flush()

        for image in prepared:
            storage_path = f"tickets/{project_id}/{ticket.id}/{uuid4().hex}-{image.filename}"
            await storage.upload(io.BytesIO(image.content), storage_path, image.content_type)
            stored_paths.append(storage_path)
            db.add(
                TicketAttachment(
                    project_id=project_id,
                    ticket_id=ticket.id,
                    original_name=image.filename,
                    storage_path=storage_path,
                    content_type=image.content_type,
                    file_size=len(image.content),
                    sha256=image.sha256,
                )
            )
        db.add(
            TicketStatusHistory(
                project_id=project_id,
                ticket_id=ticket.id,
                from_status=None,
                to_status=ticket.status,
                operator_type="system",
                note="客户公开表单提交",
            )
        )
        db.commit()
        db.refresh(ticket)
    except Exception:
        db.rollback()
        for storage_path in stored_paths:
            await storage.delete(storage_path)
        raise

    return HTMLResponse(render_public_ticket_form(token, success_number=ticket.number), status_code=201)
