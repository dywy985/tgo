"""create ticket tables (工单系统)

Revision ID: 0028_create_tickets
Revises: 0027_agent_only_ai_routing
Create Date: 2026-08-25

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0028_create_tickets"
down_revision: Union[str, None] = "0027_agent_only_ai_routing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 工单主表
    op.create_table(
        "api_tickets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False, comment="Associated project ID for multi-tenant isolation"),
        sa.Column("number", sa.String(length=32), nullable=False, comment="Ticket number e.g. TK-20260825-0001 (unique per project)"),
        sa.Column("title", sa.String(length=120), nullable=False, comment="AI extracted title (<=120 chars)"),
        sa.Column("description", sa.Text(), nullable=False, comment="Original question text from visitor"),
        sa.Column("category", sa.String(length=50), nullable=False, comment="客服分类 (configurable list)"),
        sa.Column("visitor_id", sa.Uuid(), nullable=True),
        sa.Column("session_id", sa.Uuid(), nullable=True),
        sa.Column("platform_id", sa.Uuid(), nullable=True),
        sa.Column("group_key", sa.String(length=255), nullable=True, comment="群标识 (企微 chatid)，路由匹配用"),
        sa.Column("agent_id", sa.Uuid(), nullable=True, comment="回答该问题的智能体 ID"),
        sa.Column("assignee_id", sa.Uuid(), nullable=True, comment="负责客服"),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("priority", sa.String(length=10), nullable=False),
        sa.Column("source", sa.String(length=30), nullable=False),
        sa.Column("resolve_type", sa.String(length=30), nullable=True),
        sa.Column("ai_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment="AI 判定依据"),
        sa.Column("first_response_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("sla_due_at", sa.DateTime(), nullable=True, comment="= created_at + settings.sla_timeout_minutes"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True, comment="Soft deletion timestamp"),
        sa.CheckConstraint(
            "status IN ('open', 'waiting_customer', 'pending_human', 'processing', 'resolved', 'closed', 'rejected')",
            name="chk_tickets_status",
        ),
        sa.CheckConstraint("priority IN ('low', 'normal', 'high', 'urgent')", name="chk_tickets_priority"),
        sa.CheckConstraint("source IN ('ai_auto', 'manual_service', 'staff_manual')", name="chk_tickets_source"),
        sa.CheckConstraint(
            "resolve_type IN ('ai_resolved', 'human_resolved', 'unresolved', 'auto_closed')",
            name="chk_tickets_resolve_type",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["visitor_id"], ["api_visitors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["session_id"], ["api_visitor_sessions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assignee_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tickets_project_status_priority_created", "api_tickets", ["project_id", "status", "priority", "created_at"])
    op.create_index("ix_tickets_visitor_created", "api_tickets", ["visitor_id", "created_at"])
    op.create_index("ix_tickets_assignee_status", "api_tickets", ["assignee_id", "status"])
    op.create_index("ix_tickets_project_category", "api_tickets", ["project_id", "category"])

    # 工单备注
    op.create_table(
        "api_ticket_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("staff_id", sa.Uuid(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_internal", sa.Boolean(), nullable=False, comment="True=仅内部可见"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_id"], ["api_tickets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ticket_comments_ticket_created", "api_ticket_comments", ["ticket_id", "created_at"])

    # 状态流转审计
    op.create_table(
        "api_ticket_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("from_status", sa.String(length=30), nullable=True),
        sa.Column("to_status", sa.String(length=30), nullable=False),
        sa.Column("operator_id", sa.Uuid(), nullable=True, comment="操作人"),
        sa.Column("operator_type", sa.String(length=20), nullable=False, comment="staff/system/ai"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_id"], ["api_tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ticket_history_ticket_created", "api_ticket_status_history", ["ticket_id", "created_at"])

    # 工单设置（每项目一行）
    op.create_table(
        "api_ticket_settings",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("sla_timeout_minutes", sa.Integer(), nullable=False),
        sa.Column("auto_archive_hours", sa.Integer(), nullable=False),
        sa.Column("auto_archive_enabled", sa.Boolean(), nullable=False),
        sa.Column("create_ticket_on_unresolved", sa.Boolean(), nullable=False),
        sa.Column("create_ticket_on_handoff", sa.Boolean(), nullable=False),
        sa.Column("create_ticket_on_negative", sa.Boolean(), nullable=False),
        sa.Column("ignore_ack_words", sa.Boolean(), nullable=False),
        sa.Column("reminder_enabled", sa.Boolean(), nullable=False),
        sa.Column("reminder_channels", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("urgent_notify_all", sa.Boolean(), nullable=False),
        sa.Column("categories", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ai_resolve_check_enabled", sa.Boolean(), nullable=False),
        sa.Column("auto_resolve_minutes", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )

    # 客服路由表
    op.create_table(
        "api_ticket_routes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=True, comment="渠道平台，空=该项目全部"),
        sa.Column("group_key", sa.String(length=255), nullable=True, comment="群标识 (chatid)，空=该平台全部"),
        sa.Column("visitor_key", sa.String(length=255), nullable=True, comment="特定客户 external_userid"),
        sa.Column("staff_id", sa.Uuid(), nullable=True),
        sa.Column("wecom_userid", sa.String(length=128), nullable=True, comment="企微成员 userid（推送目标）"),
        sa.Column("staff_name", sa.String(length=100), nullable=False, comment="客服姓名（冗余展示）"),
        sa.Column("priority", sa.Integer(), nullable=False, comment="匹配优先级，大者优先"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True, comment="Soft deletion timestamp"),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ticket_routes_project_group", "api_ticket_routes", ["project_id", "platform_id", "group_key"])


def downgrade() -> None:
    op.drop_index("ix_ticket_routes_project_group", table_name="api_ticket_routes")
    op.drop_table("api_ticket_routes")
    op.drop_table("api_ticket_settings")
    op.drop_index("ix_ticket_history_ticket_created", table_name="api_ticket_status_history")
    op.drop_table("api_ticket_status_history")
    op.drop_index("ix_ticket_comments_ticket_created", table_name="api_ticket_comments")
    op.drop_table("api_ticket_comments")
    op.drop_index("ix_tickets_project_category", table_name="api_tickets")
    op.drop_index("ix_tickets_assignee_status", table_name="api_tickets")
    op.drop_index("ix_tickets_visitor_created", table_name="api_tickets")
    op.drop_index("ix_tickets_project_status_priority_created", table_name="api_tickets")
    op.drop_table("api_tickets")
