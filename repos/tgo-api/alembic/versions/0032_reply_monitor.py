"""add human reply monitoring tables

Revision ID: 0032_reply_monitor
Revises: 0031_public_ticket_form
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0032_reply_monitor"
down_revision = "0031_public_ticket_form"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_reply_monitor_settings",
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("timezone", sa.String(64), server_default="Asia/Shanghai", nullable=False),
        sa.Column("weekly_schedule", postgresql.JSONB(), nullable=False),
        sa.Column("first_reminder_minutes", sa.Integer(), server_default="30", nullable=False),
        sa.Column("repeat_reminder_minutes", sa.Integer(), server_default="60", nullable=False),
        sa.Column("max_reminders", sa.Integer(), server_default="3", nullable=False),
        sa.Column("notification_channels", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )
    op.execute("""UPDATE api_platforms SET ai_mode='off', fallback_to_ai_timeout=0 WHERE type IN ('wecom','wecom_kf','wecom_bot','worktool')""")
    op.create_table(
        "api_reply_monitor_batches",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False), sa.Column("conversation_key", sa.String(255), nullable=False),
        sa.Column("conversation_type", sa.String(20), nullable=False), sa.Column("conversation_name", sa.String(255)), sa.Column("channel_open_id", sa.String(255)),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("responsible_staff_id", sa.Uuid()), sa.Column("actual_reply_staff_id", sa.Uuid()),
        sa.Column("first_customer_at", sa.DateTime(timezone=True), nullable=False), sa.Column("last_customer_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("first_reply_at", sa.DateTime(timezone=True)), sa.Column("customer_message_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("reminder_count", sa.Integer(), server_default="0", nullable=False), sa.Column("next_reminder_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["responsible_staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["actual_reply_staff_id"], ["api_staff.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reply_monitor_batch_pending", "api_reply_monitor_batches", ["project_id", "status", "next_reminder_at"])
    op.create_index("ix_reply_monitor_batch_conversation", "api_reply_monitor_batches", ["project_id", "platform_id", "conversation_key", "status"])
    op.create_index("ix_api_reply_monitor_batches_channel_open_id", "api_reply_monitor_batches", ["channel_open_id"])
    op.create_table(
        "api_reply_monitor_events",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("project_id", sa.Uuid(), nullable=False), sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid()), sa.Column("resolved_staff_id", sa.Uuid()), sa.Column("message_id", sa.String(255), nullable=False),
        sa.Column("robot_id", sa.String(255)), sa.Column("conversation_key", sa.String(255), nullable=False), sa.Column("conversation_type", sa.String(20), nullable=False),
        sa.Column("conversation_name", sa.String(255)), sa.Column("channel_open_id", sa.String(255)), sa.Column("sender_kind", sa.String(20), nullable=False), sa.Column("sender_id", sa.String(255)),
        sa.Column("sender_name", sa.String(255)), sa.Column("message_type", sa.String(30), nullable=False), sa.Column("content_summary", sa.Text()),
        sa.Column("metadata", postgresql.JSONB()), sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["batch_id"], ["api_reply_monitor_batches.id"], ondelete="SET NULL"), sa.ForeignKeyConstraint(["resolved_staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("platform_id", "message_id", name="uq_reply_monitor_platform_message"),
    )
    op.create_index("ix_reply_monitor_event_project_time", "api_reply_monitor_events", ["project_id", "occurred_at"])
    op.create_index("ix_reply_monitor_event_conversation", "api_reply_monitor_events", ["project_id", "conversation_key", "occurred_at"])
    op.create_table(
        "api_reply_monitor_reminders",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("batch_id", sa.Uuid(), nullable=False), sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(30), nullable=False), sa.Column("recipient_staff_id", sa.Uuid()), sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False), sa.Column("error_message", sa.Text()), sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["batch_id"], ["api_reply_monitor_batches.id"], ondelete="CASCADE"), sa.ForeignKeyConstraint(["recipient_staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("batch_id", "sequence", "channel", "recipient_staff_id", name="uq_reply_monitor_reminder_delivery"),
    )


def downgrade() -> None:
    op.drop_table("api_reply_monitor_reminders")
    op.drop_index("ix_reply_monitor_event_conversation", table_name="api_reply_monitor_events")
    op.drop_index("ix_reply_monitor_event_project_time", table_name="api_reply_monitor_events")
    op.drop_table("api_reply_monitor_events")
    op.drop_index("ix_reply_monitor_batch_conversation", table_name="api_reply_monitor_batches")
    op.drop_index("ix_api_reply_monitor_batches_channel_open_id", table_name="api_reply_monitor_batches")
    op.drop_index("ix_reply_monitor_batch_pending", table_name="api_reply_monitor_batches")
    op.drop_table("api_reply_monitor_batches")
    op.drop_table("api_reply_monitor_settings")
