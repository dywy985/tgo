"""人工回复监控专用工单模型。"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional, Set
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TicketStatus(str, Enum):
    """人工回复监控专用状态。"""

    PENDING_REPLY = "pending_reply"
    REPLIED = "replied"
    ARCHIVED = "archived"


class TicketPriority(str, Enum):
    """优先级."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class TicketSource(str, Enum):
    """仅保留人工回复监控自动建单。"""

    REPLY_MONITOR = "reply_monitor"


# 合法状态流转表（API 层校验，非法流转返回 400）
TICKET_STATUS_TRANSITIONS: Dict[str, Set[str]] = {
    "pending_reply": {"replied"},
    "replied": {"archived"},
    "archived": {"replied"},
}

ALL_TICKET_STATUSES = {s.value for s in TicketStatus}
ALL_TICKET_PRIORITIES = {p.value for p in TicketPriority}
ALL_TICKET_SOURCES = {s.value for s in TicketSource}


class Ticket(Base):
    """工单主表."""

    __tablename__ = "api_tickets"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_reply', 'replied', 'archived')",
            name="chk_tickets_status",
        ),
        CheckConstraint(
            "priority IN ('low', 'normal', 'high', 'urgent')",
            name="chk_tickets_priority",
        ),
        CheckConstraint(
            "source = 'reply_monitor'",
            name="chk_tickets_source",
        ),
        Index("ix_tickets_project_status_priority_created", "project_id", "status", "priority", "created_at"),
        Index("ix_tickets_visitor_created", "visitor_id", "created_at"),
        Index("ix_tickets_assignee_status", "assignee_id", "status"),
        Index("ix_tickets_project_category", "project_id", "category"),
        UniqueConstraint("project_id", "number", name="uq_tickets_project_number"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"),
        nullable=False,
        comment="Associated project ID for multi-tenant isolation",
    )
    number: Mapped[str] = mapped_column(
        String(32), nullable=False, comment="Ticket number e.g. TK-20260825-0001 (unique per project)"
    )

    # 问题内容
    title: Mapped[str] = mapped_column(String(120), nullable=False, comment="AI extracted title (<=120 chars)")
    description: Mapped[str] = mapped_column(Text, nullable=False, comment="Original question text from visitor")
    category: Mapped[str] = mapped_column(
        String(50), nullable=False, default="other", comment="客服分类 (configurable list, e.g. K6客服/K8客服/K9客服/其他)"
    )
    custom_fields: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, comment="自定义字段值 {field_key: value}，字段定义见 api_ticket_settings.form_schema"
    )
    contact_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, comment="客户公开表单联系人"
    )
    contact_phone: Mapped[Optional[str]] = mapped_column(
        String(32), nullable=True, comment="客户公开表单联系电话"
    )

    # 关联
    visitor_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_visitors.id", ondelete="SET NULL"), nullable=True
    )
    session_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_visitor_sessions.id", ondelete="SET NULL"), nullable=True
    )
    platform_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_platforms.id", ondelete="SET NULL"), nullable=True
    )
    group_key: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="群标识 (企微 chatid)，路由匹配用"
    )
    agent_id: Mapped[Optional[UUID]] = mapped_column(nullable=True, comment="回答该问题的智能体 ID")
    assignee_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_staff.id", ondelete="SET NULL"), nullable=True, comment="负责客服"
    )

    # 状态
    status: Mapped[str] = mapped_column(String(30), nullable=False, default=TicketStatus.PENDING_REPLY.value)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default=TicketPriority.NORMAL.value)
    source: Mapped[str] = mapped_column(String(30), nullable=False, default=TicketSource.REPLY_MONITOR.value)

    # AI 判定信息
    ai_summary: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, comment="AI 判定依据: {reason, urgency, confidence, sentiment, message_ids[], question_type}"
    )

    # 时间与 SLA
    first_response_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    replied_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    archived_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    sla_due_at: Mapped[Optional[datetime]] = mapped_column(nullable=True, comment="= created_at + settings.sla_timeout_minutes")

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(nullable=True, comment="Soft deletion timestamp")


class TicketAttachment(Base):
    """Image uploaded by a customer through the public ticket form."""

    __tablename__ = "api_ticket_attachments"
    __table_args__ = (
        Index("ix_ticket_attachments_ticket_created", "ticket_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )
    ticket_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_tickets.id", ondelete="CASCADE"), nullable=False
    )
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)


class TicketComment(Base):
    """工单备注."""

    __tablename__ = "api_ticket_comments"
    __table_args__ = (
        Index("ix_ticket_comments_ticket_created", "ticket_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )
    ticket_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_tickets.id", ondelete="CASCADE"), nullable=False
    )
    staff_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_staff.id", ondelete="SET NULL"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, comment="True=仅内部可见")

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TicketStatusHistory(Base):
    """工单状态流转审计."""

    __tablename__ = "api_ticket_status_history"
    __table_args__ = (
        Index("ix_ticket_history_ticket_created", "ticket_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )
    ticket_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_tickets.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    operator_id: Mapped[Optional[UUID]] = mapped_column(nullable=True, comment="操作人")
    operator_type: Mapped[str] = mapped_column(String(20), nullable=False, default="staff", comment="staff/system/ai")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)


class TicketSettings(Base):
    """工单设置（每项目一行）."""

    __tablename__ = "api_ticket_settings"

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), primary_key=True
    )

    # SLA / 归档
    sla_timeout_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    sla_by_priority: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, comment="分级SLA时限(分钟)：{low,normal,high,urgent}，缺省回退 sla_timeout_minutes"
    )
    auto_archive_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    auto_archive_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 建单策略（结果驱动，非白名单；默认全开）
    create_ticket_on_unresolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    create_ticket_on_handoff: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    create_ticket_on_negative: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ignore_ack_words: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 路由分配（负责范围）
    scope_degrade_to_same_group: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True,
        comment="转人工路由客服不可服务时，是否降级给同群其他路由客服（默认开启）",
    )

    # 提醒
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reminder_channels: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, comment="JSONB: {wecom_bot: true, in_app: true, email: false}"
    )
    urgent_notify_all: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 分类体系（可配置客服分类列表）
    categories: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="JSONB: ['K6客服','K8客服','K9客服','其他']"
    )

    # 表单模板（字段定义/必填/可编辑/自动填写规则）
    form_schema: Mapped[Optional[list]] = mapped_column(
        JSONB, nullable=True, comment="工单表单模板：[{key,label,type,required,editable,options,placeholder,auto_fill}]"
    )
    # 工单号格式
    number_format: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, comment="工单号格式：{prefix:'TK-', date:true, seq_digits:4}"
    )

    # AI 解决判定
    ai_resolve_check_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    auto_resolve_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    @property
    def reminder_channels_dict(self) -> Dict[str, Any]:
        return self.reminder_channels or {"wecom_bot": True, "in_app": True, "email": False}

    @property
    def categories_list(self) -> list:
        return self.categories or ["K6客服", "K8客服", "K9客服", "其他"]

    @property
    def sla_by_priority_dict(self) -> Dict[str, int]:
        """分级 SLA（分钟）。缺省：{low:1440, normal:240, high:60, urgent:30}，普通级回退 sla_timeout_minutes。"""
        base = {
            "low": 1440,
            "normal": self.sla_timeout_minutes,
            "high": 60,
            "urgent": 30,
        }
        if self.sla_by_priority:
            for k in ("low", "normal", "high", "urgent"):
                if k in self.sla_by_priority:
                    base[k] = int(self.sla_by_priority[k])
        return base

    @property
    def form_schema_list(self) -> list:
        """表单模板。缺省返回内置 7 字段（与 create 表单一致）。"""
        if self.form_schema:
            return self.form_schema
        return DEFAULT_TICKET_FORM_SCHEMA

    @property
    def number_format_dict(self) -> Dict[str, Any]:
        return self.number_format or {"prefix": "TK-", "date": True, "seq_digits": 4}


# 内置表单字段（key 固定，label/required/editable/options 可在设置中调整）
DEFAULT_TICKET_FORM_SCHEMA: list = [
    {"key": "title", "label": "标题", "type": "text", "required": True, "editable": True,
     "placeholder": "问题摘要", "auto_fill": {"source": "ai_fields.title"}},
    {"key": "description", "label": "问题描述", "type": "textarea", "required": True, "editable": True,
     "placeholder": "访客问题原文", "auto_fill": {"source": "ai_fields.description"}},
    {"key": "category", "label": "分类", "type": "select", "required": False, "editable": True,
     "options": ["K6客服", "K8客服", "K9客服", "其他"], "auto_fill": {"source": "ai_fields.category", "fallback": "其他"}},
    {"key": "priority", "label": "优先级", "type": "select", "required": False, "editable": True,
     "options": ["low", "normal", "high", "urgent"], "auto_fill": {"source": "ai_fields.priority", "fallback": "normal"}},
    {"key": "assignee_id", "label": "负责客服", "type": "staff", "required": False, "editable": True, "options": [], "auto_fill": None},
    {"key": "visitor_id", "label": "访客", "type": "visitor", "required": False, "editable": False, "options": [], "auto_fill": None},
    {"key": "group_key", "label": "群标识", "type": "text", "required": False, "editable": True,
     "options": [], "auto_fill": {"source": "ai_fields.group_key"}},
]


class TicketRoute(Base):
    """项目/群 → 客服个人路由表（工单推送与分类归属）."""

    __tablename__ = "api_ticket_routes"
    __table_args__ = (
        Index("ix_ticket_routes_project_group", "project_id", "platform_id", "group_key"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )

    # 匹配维度
    platform_id: Mapped[Optional[UUID]] = mapped_column(nullable=True, comment="渠道平台，空=该项目全部")
    group_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="群标识 (chatid)，空=该平台全部")
    visitor_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="特定客户 external_userid，空=全部")

    # 目标客服（个人）
    staff_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_staff.id", ondelete="SET NULL"), nullable=True
    )
    wecom_userid: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, comment="企微成员 userid（推送目标）")
    staff_name: Mapped[str] = mapped_column(String(100), nullable=False, comment="客服姓名（冗余展示）")

    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=10, comment="匹配优先级，大者优先")

    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(nullable=True, comment="Soft deletion timestamp")
