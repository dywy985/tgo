"""Ticket endpoints (工单系统).

工单 = 需要处理（未解决/转人工）的客户问题的持久化记录。
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import get_current_active_user, require_permission
from app.models import (
    Staff,
    Ticket,
    TicketComment,
    TicketRoute,
    TicketSettings,
    TicketStatusHistory,
    TICKET_STATUS_TRANSITIONS,
)
from app.schemas import (
    TicketAssign,
    TicketCommentCreate,
    TicketCommentResponse,
    TicketCreate,
    TicketHistoryResponse,
    TicketListParams,
    TicketListResponse,
    TicketResponse,
    TicketRouteCreate,
    TicketRouteResponse,
    TicketRouteUpdate,
    TicketSettingsResponse,
    TicketSettingsUpdate,
    TicketStatisticsResponse,
    TicketStatusChange,
    TicketUpdate,
)

logger = get_logger("endpoints.tickets")
router = APIRouter()

DEFAULT_CATEGORIES = ["K6客服", "K8客服", "K9客服", "其他"]


def _generate_ticket_number(db: Session, project_id: UUID) -> str:
    """生成工单号（向后兼容，新代码请用 ticket_service.generate_ticket_number）."""
    from app.services.ticket_service import generate_ticket_number as _gen

    return _gen(db, project_id)


def _get_settings(db: Session, project_id: UUID) -> TicketSettings:
    """获取设置（不存在则按默认值创建）."""
    settings = db.query(TicketSettings).filter(TicketSettings.project_id == project_id).first()
    if settings is None:
        settings = TicketSettings(project_id=project_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _fill_display_names(db: Session, ticket: Ticket) -> TicketResponse:
    """填充展示冗余字段（负责人姓名/访客姓名）."""
    resp = TicketResponse.model_validate(ticket)
    if ticket.assignee_id:
        staff = db.query(Staff).filter(Staff.id == ticket.assignee_id, Staff.deleted_at.is_(None)).first()
        if staff:
            resp.assignee_name = staff.name or staff.username
    if ticket.visitor_id:
        from app.models import Visitor

        visitor = db.query(Visitor).filter(Visitor.id == ticket.visitor_id, Visitor.deleted_at.is_(None)).first()
        if visitor:
            resp.visitor_name = visitor.nickname or visitor.name or getattr(visitor, "name", None)
    return resp


def _apply_status_transition(
    db: Session,
    ticket: Ticket,
    to_status: str,
    *,
    operator: Optional[Staff] = None,
    operator_type: str = "staff",
    note: Optional[str] = None,
    resolve_type: Optional[str] = None,
) -> None:
    """状态流转：校验合法表 + 写审计 + 更新时间字段."""
    from_status = ticket.status
    if to_status == from_status:
        return

    allowed = TICKET_STATUS_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Illegal status transition: {from_status} -> {to_status}",
        )

    ticket.status = to_status
    now = datetime.utcnow()

    # 时间字段维护
    if to_status == "resolved":
        ticket.resolved_at = now
        if ticket.first_response_at is None:
            ticket.first_response_at = now
        ticket.resolve_type = resolve_type or (
            "ai_resolved" if operator_type == "ai" else "human_resolved"
        )
    elif to_status == "closed":
        ticket.closed_at = now
    elif to_status in ("processing", "pending_human"):
        if ticket.first_response_at is None:
            ticket.first_response_at = now
    elif to_status == "open" and from_status in ("resolved", "closed", "rejected"):
        # reopen
        ticket.resolved_at = None
        ticket.closed_at = None
        ticket.resolve_type = None

    db.add(
        TicketStatusHistory(
            project_id=ticket.project_id,
            ticket_id=ticket.id,
            from_status=from_status,
            to_status=to_status,
            operator_id=operator.id if operator else None,
            operator_type=operator_type,
            note=note,
        )
    )
    db.commit()
    db.refresh(ticket)


# ---------------------------------------------------------------------------
# Tickets CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=TicketListResponse)
async def list_tickets(
    params: TicketListParams = Depends(),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:list")),
) -> TicketListResponse:
    """工单列表：状态/优先级/负责人/访客/分类/关键词/日期筛选 + 分页."""
    query = db.query(Ticket).filter(
        Ticket.project_id == current_user.project_id,
        Ticket.deleted_at.is_(None),
    )

    if params.status:
        query = query.filter(Ticket.status == params.status)
    if params.priority:
        query = query.filter(Ticket.priority == params.priority)
    if params.assignee_id:
        query = query.filter(Ticket.assignee_id == params.assignee_id)
    if params.visitor_id:
        query = query.filter(Ticket.visitor_id == params.visitor_id)
    if params.category:
        query = query.filter(Ticket.category == params.category)
    if params.keyword:
        kw = f"%{params.keyword}%"
        query = query.filter((Ticket.title.ilike(kw)) | (Ticket.description.ilike(kw)))
    if params.date_from:
        query = query.filter(Ticket.created_at >= params.date_from)
    if params.date_to:
        query = query.filter(Ticket.created_at <= params.date_to)

    total = query.count()
    tickets = (
        query.order_by(Ticket.created_at.desc())
        .offset(params.offset)
        .limit(params.limit)
        .all()
    )

    data = [_fill_display_names(db, t) for t in tickets]
    return TicketListResponse(
        data=data,
        pagination={
            "total": total,
            "limit": params.limit,
            "offset": params.offset,
            "has_next": params.offset + params.limit < total,
            "has_prev": params.offset > 0,
        },
    )


@router.post("", response_model=TicketResponse, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    ticket_data: TicketCreate,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:create")),
) -> TicketResponse:
    """创建工单（手动建单 / 内部联动）. 按 form_schema 校验必填 + 生成可配置工单号."""
    settings = _get_settings(db, current_user.project_id)
    schema = settings.form_schema_list
    form_keys = {f.get("key") for f in schema}

    # 必填校验（内置字段 + 自定义字段）
    for f in schema:
        if f.get("required"):
            key = f.get("key")
            if key == "title" and not (ticket_data.title or "").strip():
                raise HTTPException(status_code=400, detail=f"字段「{f.get('label', key)}」为必填")
            if key == "description" and not (ticket_data.description or "").strip():
                raise HTTPException(status_code=400, detail=f"字段「{f.get('label', key)}」为必填")
            if key not in ("title", "description") and key in form_keys:
                val = (ticket_data.custom_fields or {}).get(key) if key not in ("category", "priority", "assignee_id", "group_key") else getattr(ticket_data, key, None)
                if val is None or val == "":
                    raise HTTPException(status_code=400, detail=f"字段「{f.get('label', key)}」为必填")

    # 自定义字段只保留 schema 中定义的 key
    custom_fields = ticket_data.custom_fields or {}
    if custom_fields:
        custom_fields = {k: v for k, v in custom_fields.items() if k in form_keys}

    ticket = Ticket(
        project_id=current_user.project_id,
        number=generate_ticket_number(db, current_user.project_id, settings.number_format_dict),
        title=ticket_data.title,
        description=ticket_data.description,
        category=ticket_data.category or "other",
        priority=ticket_data.priority,
        source=ticket_data.source,
        visitor_id=ticket_data.visitor_id,
        session_id=ticket_data.session_id,
        platform_id=ticket_data.platform_id,
        group_key=ticket_data.group_key,
        agent_id=ticket_data.agent_id,
        assignee_id=ticket_data.assignee_id,
        ai_summary=ticket_data.ai_summary,
        custom_fields=custom_fields or None,
        sla_due_at=ticket_data.sla_due_at,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    db.add(
        TicketStatusHistory(
            project_id=ticket.project_id,
            ticket_id=ticket.id,
            from_status=None,
            to_status=ticket.status,
            operator_id=current_user.id,
            operator_type="staff",
            note="工单创建",
        )
    )
    db.commit()
    return _fill_display_names(db, ticket)


@router.get("/statistics", response_model=TicketStatisticsResponse)
async def ticket_statistics(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:read")),
) -> TicketStatisticsResponse:
    """工单统计（骨架版）：状态/优先级/分类分布 + 关键指标."""
    pid = current_user.project_id
    base = db.query(Ticket).filter(Ticket.project_id == pid, Ticket.deleted_at.is_(None))

    total = base.count()

    by_status: dict = {}
    for row in base.with_entities(Ticket.status, func.count()).group_by(Ticket.status).all():
        by_status[row[0]] = row[1]

    by_priority: dict = {}
    for row in base.with_entities(Ticket.priority, func.count()).group_by(Ticket.priority).all():
        by_priority[row[0]] = row[1]

    by_category: dict = {}
    for row in base.with_entities(Ticket.category, func.count()).group_by(Ticket.category).all():
        by_category[row[0]] = row[1]

    unresolved_total = base.filter(Ticket.status.in_(["open", "pending_human", "processing"])).count()
    pending_human_total = base.filter(Ticket.status == "pending_human").count()
    ai_resolved_total = base.filter(Ticket.resolve_type == "ai_resolved").count()
    human_resolved_total = base.filter(Ticket.resolve_type == "human_resolved").count()
    handoff_count = base.filter(Ticket.source == "manual_service").count()

    return TicketStatisticsResponse(
        total=total,
        by_status=by_status,
        by_priority=by_priority,
        by_category=by_category,
        unresolved_total=unresolved_total,
        pending_human_total=pending_human_total,
        ai_resolved_total=ai_resolved_total,
        human_resolved_total=human_resolved_total,
        handoff_rate=round(handoff_count / total, 4) if total else 0.0,
    )


# ---------------------------------------------------------------------------
# Ticket settings (must be declared before /{ticket_id} routes)
# ---------------------------------------------------------------------------

def _settings_response(settings: TicketSettings) -> TicketSettingsResponse:
    """组装设置响应（含表单模板/分级SLA/工单号格式）."""
    return TicketSettingsResponse(
        project_id=settings.project_id,
        sla_timeout_minutes=settings.sla_timeout_minutes,
        sla_by_priority=settings.sla_by_priority_dict,
        auto_archive_hours=settings.auto_archive_hours,
        auto_archive_enabled=settings.auto_archive_enabled,
        create_ticket_on_unresolved=settings.create_ticket_on_unresolved,
        create_ticket_on_handoff=settings.create_ticket_on_handoff,
        create_ticket_on_negative=settings.create_ticket_on_negative,
        ignore_ack_words=settings.ignore_ack_words,
        scope_degrade_to_same_group=settings.scope_degrade_to_same_group,
        reminder_enabled=settings.reminder_enabled,
        reminder_channels=settings.reminder_channels_dict,
        urgent_notify_all=settings.urgent_notify_all,
        categories=settings.categories_list,
        form_schema=settings.form_schema_list,
        number_format=settings.number_format_dict,
        ai_resolve_check_enabled=settings.ai_resolve_check_enabled,
        auto_resolve_minutes=settings.auto_resolve_minutes,
        updated_at=settings.updated_at,
    )


@router.get("/settings", response_model=TicketSettingsResponse)
async def get_ticket_settings(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:read")),
) -> TicketSettingsResponse:
    """读取工单设置（不存在则按默认值创建返回）."""
    settings = _get_settings(db, current_user.project_id)
    return _settings_response(settings)


@router.put("/settings", response_model=TicketSettingsResponse)
async def update_ticket_settings(
    update_data: TicketSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:update")),
) -> TicketSettingsResponse:
    """更新工单设置（只更新传入字段）."""
    settings = _get_settings(db, current_user.project_id)
    fields = update_data.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return _settings_response(settings)


# ---------------------------------------------------------------------------
# Ticket routes (must be declared before /{ticket_id} routes)
# ---------------------------------------------------------------------------

@router.get("/routes", response_model=List[TicketRouteResponse])
async def list_routes(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:read")),
) -> List[TicketRouteResponse]:
    """客服路由列表."""
    routes = (
        db.query(TicketRoute)
        .filter(TicketRoute.project_id == current_user.project_id, TicketRoute.deleted_at.is_(None))
        .order_by(TicketRoute.priority.desc())
        .all()
    )
    return [TicketRouteResponse.model_validate(r) for r in routes]


@router.get("/routes/groups", response_model=List[dict])
async def list_route_groups(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:read")),
) -> List[dict]:
    """已知企微群列表（供路由配置下拉选择，避免手填 chatid）。

    聚合来源（去重，按群名排序）：
      1. pt_wecom_inbox（tgo-platform 同库时）：chat_type='group' 的 chat_id + conv_name
      2. api_ticket_routes.group_key（已配置路由）
      3. api_tickets.group_key（历史工单）
      4. api_visitor_waiting_queue.group_key（排队记录）

    返回: [{group_key, group_name}]，group_name 可能为空（本地聚合来源无名）。
    """
    pid = current_user.project_id
    groups: dict[str, str] = {}

    # 1) pt_wecom_inbox：同库部署时聚合（含群名）
    try:
        from sqlalchemy import text

        rows = db.execute(
            text(
                "SELECT DISTINCT ON (chat_id) chat_id, "
                " COALESCE(raw_payload->>'conv_name', '') AS conv_name "
                "FROM pt_wecom_inbox "
                "WHERE chat_id IS NOT NULL AND chat_id <> '' "
                "ORDER BY chat_id, created_at DESC"
            )
        ).all()
        for row in rows:
            chat_id = (row[0] or "").strip()
            if chat_id:
                groups[chat_id] = (row[1] or "").strip() or ""
    except Exception as e:  # noqa: BLE001 - 表不存在/不同库：忽略该来源
        logger.debug(f"[ROUTE] pt_wecom_inbox 聚合失败(忽略): {e}")

    # 2) api_ticket_routes.group_key
    for r in db.query(TicketRoute).filter(
        TicketRoute.project_id == pid,
        TicketRoute.deleted_at.is_(None),
        TicketRoute.group_key.isnot(None),
    ).all():
        if r.group_key:
            groups.setdefault(r.group_key, "")

    # 3) api_tickets.group_key（历史工单）
    try:
        for gk, in db.query(Ticket.group_key).filter(
            Ticket.project_id == pid,
            Ticket.deleted_at.is_(None),
            Ticket.group_key.isnot(None),
        ).all():
            if gk:
                groups.setdefault(gk, "")
    except Exception as e:  # noqa: BLE001
        logger.debug(f"[ROUTE] tickets 群聚合失败(忽略): {e}")

    # 4) api_visitor_waiting_queue.group_key
    try:
        from app.models import VisitorWaitingQueue

        for gk, in db.query(VisitorWaitingQueue.group_key).filter(
            VisitorWaitingQueue.project_id == pid,
            VisitorWaitingQueue.group_key.isnot(None),
        ).all():
            if gk:
                groups.setdefault(gk, "")
    except Exception as e:  # noqa: BLE001
        logger.debug(f"[ROUTE] waiting_queue 群聚合失败(忽略): {e}")

    result = [
        {"group_key": k, "group_name": v}
        for k, v in groups.items()
    ]
    result.sort(key=lambda g: (not g["group_name"], g["group_name"], g["group_key"]))
    return result


@router.post("/routes", response_model=TicketRouteResponse, status_code=status.HTTP_201_CREATED)
async def create_route(
    route_data: TicketRouteCreate,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:update")),
) -> TicketRouteResponse:
    """新增路由：群/平台 → 客服个人."""
    route = TicketRoute(
        project_id=current_user.project_id,
        platform_id=route_data.platform_id,
        group_key=route_data.group_key,
        visitor_key=route_data.visitor_key,
        staff_id=route_data.staff_id,
        wecom_userid=route_data.wecom_userid,
        staff_name=route_data.staff_name,
        priority=route_data.priority,
    )
    db.add(route)
    db.commit()
    db.refresh(route)
    return TicketRouteResponse.model_validate(route)


@router.patch("/routes/{route_id}", response_model=TicketRouteResponse)
async def update_route(
    route_id: UUID,
    route_data: TicketRouteUpdate,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:update")),
) -> TicketRouteResponse:
    """修改路由."""
    route = (
        db.query(TicketRoute)
        .filter(
            TicketRoute.id == route_id,
            TicketRoute.project_id == current_user.project_id,
            TicketRoute.deleted_at.is_(None),
        )
        .first()
    )
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    fields = route_data.model_dump(exclude_unset=True)
    for key, value in fields.items():
        setattr(route, key, value)
    db.commit()
    db.refresh(route)
    return TicketRouteResponse.model_validate(route)


@router.delete("/routes/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(
    route_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:update")),
):
    """删除路由（软删除）."""
    route = (
        db.query(TicketRoute)
        .filter(
            TicketRoute.id == route_id,
            TicketRoute.project_id == current_user.project_id,
            TicketRoute.deleted_at.is_(None),
        )
        .first()
    )
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    route.deleted_at = datetime.utcnow()
    db.commit()


# ---------------------------------------------------------------------------
# Ticket detail & operations
# ---------------------------------------------------------------------------

def _get_owned_ticket(db: Session, project_id: UUID, ticket_id: UUID) -> Ticket:
    ticket = (
        db.query(Ticket)
        .filter(
            Ticket.id == ticket_id,
            Ticket.project_id == project_id,
            Ticket.deleted_at.is_(None),
        )
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:read")),
) -> TicketResponse:
    """工单详情."""
    ticket = _get_owned_ticket(db, current_user.project_id, ticket_id)
    return _fill_display_names(db, ticket)


@router.patch("/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: UUID,
    update_data: TicketUpdate,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:update")),
) -> TicketResponse:
    """修改工单（标题/描述/分类/优先级/负责人/自定义字段）.

    校验：只允许 form_schema 中 editable=true 的字段；required 字段不可置空。
    """
    ticket = _get_owned_ticket(db, current_user.project_id, ticket_id)
    settings = _get_settings(db, current_user.project_id)
    schema = settings.form_schema_list
    by_key = {f.get("key"): f for f in schema}
    form_keys = set(by_key.keys())

    fields = update_data.model_dump(exclude_unset=True)
    custom_fields = fields.pop("custom_fields", None)

    # editable 校验
    for key in fields:
        if key == "custom_fields":
            continue
        fd = by_key.get(key)
        if fd is not None and fd.get("editable") is False:
            raise HTTPException(status_code=400, detail=f"字段「{fd.get('label', key)}」不可编辑")
        if key in ("visitor_id", "agent_id"):
            raise HTTPException(status_code=400, detail="该字段不可编辑")

    # required 校验：不可置空
    for key, value in fields.items():
        if value is None or value == "":
            fd = by_key.get(key)
            if fd and fd.get("required"):
                raise HTTPException(status_code=400, detail=f"字段「{fd.get('label', key)}」为必填，不可置空")

    # 自定义字段：只允许 schema 定义的 key + editable
    if custom_fields is not None:
        allowed_custom = {
            k: f for k, f in by_key.items() if k not in ("title", "description", "category", "priority", "assignee_id", "visitor_id", "group_key")
        }
        cleaned = {}
        for k, v in custom_fields.items():
            if k not in allowed_custom:
                raise HTTPException(status_code=400, detail=f"未知自定义字段: {k}")
            if allowed_custom[k].get("editable") is False:
                raise HTTPException(status_code=400, detail=f"字段「{allowed_custom[k].get('label', k)}」不可编辑")
            cleaned[k] = v
        for k, fd in allowed_custom.items():
            if fd.get("required") and (cleaned.get(k) is None or cleaned.get(k) == ""):
                raise HTTPException(status_code=400, detail=f"字段「{fd.get('label', k)}」为必填，不可置空")
        # 未传的字段保留原值
        merged = dict(ticket.custom_fields or {})
        merged.update(cleaned)
        ticket.custom_fields = merged or None

    changed = False
    for key, value in fields.items():
        if getattr(ticket, key, None) != value:
            setattr(ticket, key, value)
            changed = True

    if changed:
        db.commit()
        db.refresh(ticket)
    return _fill_display_names(db, ticket)


@router.post("/{ticket_id}/assign", response_model=TicketResponse)
async def assign_ticket(
    ticket_id: UUID,
    assign_data: TicketAssign,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:update")),
) -> TicketResponse:
    """分配客服."""
    ticket = _get_owned_ticket(db, current_user.project_id, ticket_id)
    ticket.assignee_id = assign_data.staff_id
    db.commit()
    db.refresh(ticket)
    return _fill_display_names(db, ticket)


@router.post("/{ticket_id}/status", response_model=TicketResponse)
async def change_ticket_status(
    ticket_id: UUID,
    change: TicketStatusChange,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:update")),
) -> TicketResponse:
    """状态流转（合法流转表校验 + 审计）."""
    ticket = _get_owned_ticket(db, current_user.project_id, ticket_id)
    _apply_status_transition(
        db,
        ticket,
        change.status,
        operator=current_user,
        operator_type=change.operator_type,
        note=change.note,
    )
    return _fill_display_names(db, ticket)


@router.post("/{ticket_id}/comments", response_model=TicketCommentResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    ticket_id: UUID,
    comment_data: TicketCommentCreate,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:update")),
) -> TicketCommentResponse:
    """加备注."""
    ticket = _get_owned_ticket(db, current_user.project_id, ticket_id)
    comment = TicketComment(
        project_id=current_user.project_id,
        ticket_id=ticket.id,
        staff_id=current_user.id,
        content=comment_data.content,
        is_internal=comment_data.is_internal,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    staff = db.query(Staff).filter(Staff.id == current_user.id).first()
    resp = TicketCommentResponse.model_validate(comment)
    resp.staff_name = staff.name or staff.username if staff else None
    return resp


@router.get("/{ticket_id}/comments", response_model=List[TicketCommentResponse])
async def get_ticket_comments(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:read")),
) -> List[TicketCommentResponse]:
    """工单备注列表."""
    ticket = _get_owned_ticket(db, current_user.project_id, ticket_id)
    comments = (
        db.query(TicketComment)
        .filter(TicketComment.ticket_id == ticket.id)
        .order_by(TicketComment.created_at.asc())
        .all()
    )
    staff_ids = {c.staff_id for c in comments if c.staff_id}
    staff_map: dict = {}
    if staff_ids:
        staffs = db.query(Staff).filter(Staff.id.in_(staff_ids)).all()
        staff_map = {s.id: (s.name or s.username) for s in staffs}
    result = []
    for c in comments:
        resp = TicketCommentResponse.model_validate(c)
        resp.staff_name = staff_map.get(c.staff_id) if c.staff_id else None
        result.append(resp)
    return result


@router.get("/{ticket_id}/history", response_model=List[TicketHistoryResponse])
async def get_ticket_history(
    ticket_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(require_permission("tickets:read")),
) -> List[TicketHistoryResponse]:
    """状态流转历史."""
    ticket = _get_owned_ticket(db, current_user.project_id, ticket_id)
    history = (
        db.query(TicketStatusHistory)
        .filter(TicketStatusHistory.ticket_id == ticket.id)
        .order_by(TicketStatusHistory.created_at.asc())
        .all()
    )
    return [TicketHistoryResponse.model_validate(h) for h in history]
