"""add WeCom digest settings

Revision ID: 0038_reply_monitor_digest
Revises: 0037_monitor_ticket_workflow
"""

from alembic import op
import sqlalchemy as sa


revision = "0038_reply_monitor_digest"
down_revision = "0037_monitor_ticket_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("api_reply_monitor_settings", sa.Column(
        "wecom_digest_minutes", sa.Integer(), server_default="5", nullable=False
    ))
    op.add_column("api_reply_monitor_settings", sa.Column(
        "wecom_digest_max_items", sa.Integer(), server_default="10", nullable=False
    ))
    op.create_table(
        "api_reply_monitor_digests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_staff_id", sa.Uuid(), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("unassigned", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column("error_message", sa.Text()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_staff_id"], ["api_staff.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_reply_monitor_digest_key"),
    )
    op.create_index("ix_reply_monitor_digest_dispatch", "api_reply_monitor_digests", ["status", "window_start"])
    op.add_column("api_reply_monitor_reminders", sa.Column("digest_id", sa.Uuid()))
    op.create_foreign_key(
        "fk_reply_monitor_reminder_digest", "api_reply_monitor_reminders",
        "api_reply_monitor_digests", ["digest_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_api_reply_monitor_reminders_digest_id", "api_reply_monitor_reminders", ["digest_id"])


def downgrade() -> None:
    op.drop_index("ix_api_reply_monitor_reminders_digest_id", table_name="api_reply_monitor_reminders")
    op.drop_constraint("fk_reply_monitor_reminder_digest", "api_reply_monitor_reminders", type_="foreignkey")
    op.drop_column("api_reply_monitor_reminders", "digest_id")
    op.drop_index("ix_reply_monitor_digest_dispatch", table_name="api_reply_monitor_digests")
    op.drop_table("api_reply_monitor_digests")
    op.drop_column("api_reply_monitor_settings", "wecom_digest_max_items")
    op.drop_column("api_reply_monitor_settings", "wecom_digest_minutes")
