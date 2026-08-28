"""Ticket schemas (工单系统)."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.base import BaseSchema, PaginatedResponse


# ---------------------------------------------------------------------------
# Ticket
# ---------------------------------------------------------------------------

class TicketCreate(BaseSchema):
    """创建工单（手动建单 / 内部联动）. source 默认 ai_auto，坐席建单传 staff_manual."""

    title: str = Field(..., max_length=120, description="问题标题")
    description: str = Field(..., description="问题原文")
    category: str = Field("other", max_length=50, description="客服分类")
    priority: str = Field("normal", description="low/normal/high/urgent")
    source: str = Field("staff_manual", description="ai_auto/manual_service/staff_manual")
    visitor_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    platform_id: Optional[UUID] = None
    group_key: Optional[str] = Field(None, max_length=255, description="群标识 chatid")
    agent_id: Optional[UUID] = None
    assignee_id: Optional[UUID] = None
    ai_summary: Optional[Dict[str, Any]] = None
    sla_due_at: Optional[datetime] = None
    custom_fields: Optional[Dict[str, Any]] = Field(
        None, description="自定义字段值，字段定义见工单设置 form_schema"
    )

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, v: str) -> str:
        if v not in ("low", "normal", "high", "urgent"):
            raise ValueError("priority must be one of: low, normal, high, urgent")
        return v

    @field_validator("source")
    @classmethod
    def _validate_source(cls, v: str) -> str:
        if v not in ("ai_auto", "manual_service", "staff_manual"):
            raise ValueError("source must be one of: ai_auto, manual_service, staff_manual")
        return v


class TicketUpdate(BaseSchema):
    """修改工单（标题/描述/分类/优先级/负责人/自定义字段）."""

    title: Optional[str] = Field(None, max_length=120)
    description: Optional[str] = Field(None, description="问题描述")
    category: Optional[str] = Field(None, max_length=50)
    priority: Optional[str] = None
    assignee_id: Optional[UUID] = None
    group_key: Optional[str] = Field(None, max_length=255)
    custom_fields: Optional[Dict[str, Any]] = Field(
        None, description="自定义字段值 {field_key: value}，整体替换"
    )

    @field_validator("priority")
    @classmethod
    def _validate_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("low", "normal", "high", "urgent"):
            raise ValueError("priority must be one of: low, normal, high, urgent")
        return v


class TicketStatusChange(BaseSchema):
    """状态流转."""

    status: str = Field(..., description="目标状态")
    note: Optional[str] = Field(None, description="流转原因/备注")
    operator_type: str = Field("staff", description="staff/system/ai")

    @field_validator("status")
    @classmethod
    def _validate_status(cls, v: str) -> str:
        allowed = {"open", "pending_human", "processing", "resolved", "closed", "rejected"}
        if v not in allowed:
            raise ValueError(f"status must be one of: {sorted(allowed)}")
        return v


class TicketAssign(BaseSchema):
    """分配客服."""

    staff_id: Optional[UUID] = None
    note: Optional[str] = None


class TicketListParams(BaseSchema):
    """列表筛选参数."""

    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_id: Optional[UUID] = None
    visitor_id: Optional[UUID] = None
    category: Optional[str] = None
    keyword: Optional[str] = Field(None, max_length=200, description="标题/描述模糊搜索")
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)


class TicketResponse(BaseSchema):
    """工单详情."""

    id: UUID
    project_id: UUID
    number: str
    title: str
    description: str
    category: str
    visitor_id: Optional[UUID] = None
    session_id: Optional[UUID] = None
    platform_id: Optional[UUID] = None
    group_key: Optional[str] = None
    agent_id: Optional[UUID] = None
    assignee_id: Optional[UUID] = None
    status: str
    priority: str
    source: str
    resolve_type: Optional[str] = None
    ai_summary: Optional[Dict[str, Any]] = None
    custom_fields: Optional[Dict[str, Any]] = None
    first_response_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    sla_due_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None

    # 展示冗余（服务端填充）
    assignee_name: Optional[str] = None
    visitor_name: Optional[str] = None


class TicketListResponse(PaginatedResponse):
    """工单列表（分页）."""

    data: List[TicketResponse]


# ---------------------------------------------------------------------------
# Comments / History
# ---------------------------------------------------------------------------

class TicketCommentCreate(BaseSchema):
    """加备注."""

    content: str = Field(..., description="备注内容")
    is_internal: bool = Field(True, description="True=仅内部可见")


class TicketCommentResponse(BaseSchema):
    """备注."""

    id: UUID
    ticket_id: UUID
    staff_id: Optional[UUID] = None
    staff_name: Optional[str] = None
    content: str
    is_internal: bool
    created_at: datetime


class TicketHistoryResponse(BaseSchema):
    """状态流转记录."""

    id: UUID
    ticket_id: UUID
    from_status: Optional[str] = None
    to_status: str
    operator_id: Optional[UUID] = None
    operator_type: str
    note: Optional[str] = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class TicketSettingsResponse(BaseSchema):
    """工单设置."""

    project_id: UUID
    sla_timeout_minutes: int = 15
    sla_by_priority: Dict[str, int] = Field(
        default_factory=lambda: {"low": 1440, "normal": 15, "high": 60, "urgent": 30}
    )
    auto_archive_hours: int = 24
    auto_archive_enabled: bool = True
    create_ticket_on_unresolved: bool = True
    create_ticket_on_handoff: bool = True
    create_ticket_on_negative: bool = True
    ignore_ack_words: bool = True
    scope_degrade_to_same_group: bool = True
    reminder_enabled: bool = True
    reminder_channels: Dict[str, Any] = Field(default_factory=lambda: {"wecom_bot": True, "in_app": True, "email": False})
    urgent_notify_all: bool = True
    categories: List[str] = Field(default_factory=lambda: ["K6客服", "K8客服", "K9客服", "其他"])
    form_schema: List[Dict[str, Any]] = Field(
        default_factory=list, description="表单模板：[{key,label,type,required,editable,options,placeholder,auto_fill}]"
    )
    number_format: Dict[str, Any] = Field(default_factory=lambda: {"prefix": "TK-", "date": True, "seq_digits": 4})
    ai_resolve_check_enabled: bool = True
    auto_resolve_minutes: int = 30
    updated_at: Optional[datetime] = None


class TicketSettingsUpdate(BaseSchema):
    """更新工单设置（全字段可选，只更新传入的）."""

    sla_timeout_minutes: Optional[int] = Field(None, ge=1, le=1440)
    sla_by_priority: Optional[Dict[str, int]] = None
    auto_archive_hours: Optional[int] = Field(None, ge=0, le=720)
    auto_archive_enabled: Optional[bool] = None
    create_ticket_on_unresolved: Optional[bool] = None
    create_ticket_on_handoff: Optional[bool] = None
    create_ticket_on_negative: Optional[bool] = None
    ignore_ack_words: Optional[bool] = None
    scope_degrade_to_same_group: Optional[bool] = None
    reminder_enabled: Optional[bool] = None
    reminder_channels: Optional[Dict[str, Any]] = None
    urgent_notify_all: Optional[bool] = None
    categories: Optional[List[str]] = None
    form_schema: Optional[List[Dict[str, Any]]] = None
    number_format: Optional[Dict[str, Any]] = None
    ai_resolve_check_enabled: Optional[bool] = None
    auto_resolve_minutes: Optional[int] = Field(None, ge=1, le=1440)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

class TicketRouteCreate(BaseSchema):
    """新增路由：群/平台 → 客服个人."""

    platform_id: Optional[UUID] = None
    group_key: Optional[str] = Field(None, max_length=255, description="群标识 chatid，空=该平台全部")
    visitor_key: Optional[str] = Field(None, max_length=255, description="特定客户 external_userid")
    staff_id: Optional[UUID] = None
    wecom_userid: Optional[str] = Field(None, max_length=128)
    staff_name: str = Field(..., max_length=100)
    priority: int = Field(10, ge=1, le=100)


class TicketRouteUpdate(BaseSchema):
    """修改路由."""

    platform_id: Optional[UUID] = None
    group_key: Optional[str] = Field(None, max_length=255)
    visitor_key: Optional[str] = Field(None, max_length=255)
    staff_id: Optional[UUID] = None
    wecom_userid: Optional[str] = Field(None, max_length=128)
    staff_name: Optional[str] = Field(None, max_length=100)
    priority: Optional[int] = Field(None, ge=1, le=100)


class TicketRouteResponse(BaseSchema):
    """路由."""

    id: UUID
    project_id: UUID
    platform_id: Optional[UUID] = None
    group_key: Optional[str] = None
    visitor_key: Optional[str] = None
    staff_id: Optional[UUID] = None
    wecom_userid: Optional[str] = None
    staff_name: str
    priority: int
    created_at: datetime


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

class TicketStatisticsResponse(BaseSchema):
    """工单统计（骨架版：状态分布 + 简单指标）."""

    total: int
    by_status: Dict[str, int]
    by_priority: Dict[str, int]
    by_category: Dict[str, int]
    unresolved_total: int
    pending_human_total: int
    ai_resolved_total: int
    human_resolved_total: int
    handoff_rate: float  # 转人工率 0-1
