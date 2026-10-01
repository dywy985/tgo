"""add sanitized media for reply-monitor events

Revision ID: 0035_reply_monitor_media
Revises: 0034_reply_monitor_tickets
"""

from alembic import op
import sqlalchemy as sa


revision = "0035_reply_monitor_media"
down_revision = "0034_reply_monitor_tickets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_reply_monitor_media",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("batch_id", sa.Uuid(), nullable=True),
        sa.Column("ticket_attachment_id", sa.Uuid(), nullable=True),
        sa.Column("message_id", sa.String(length=255), nullable=False),
        sa.Column("original_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=1024), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="ready", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["api_reply_monitor_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["batch_id"], ["api_reply_monitor_batches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ticket_attachment_id"], ["api_ticket_attachments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticket_attachment_id", name="uq_reply_monitor_media_ticket_attachment"),
        sa.UniqueConstraint(
            "platform_id", "message_id", "sha256",
            name="uq_reply_monitor_media_platform_message_sha",
        ),
    )
    op.create_index(
        "ix_reply_monitor_media_event", "api_reply_monitor_media", ["event_id", "created_at"]
    )
    op.create_index(
        "ix_reply_monitor_media_expiry", "api_reply_monitor_media", ["status", "expires_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_reply_monitor_media_expiry", table_name="api_reply_monitor_media")
    op.drop_index("ix_reply_monitor_media_event", table_name="api_reply_monitor_media")
    op.drop_table("api_reply_monitor_media")
