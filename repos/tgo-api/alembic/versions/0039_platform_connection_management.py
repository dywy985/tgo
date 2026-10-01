"""platform connection management

Revision ID: 0039_platform_connections
Revises: 0038_reply_monitor_digest
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0039_platform_connections"
down_revision = "0038_reply_monitor_digest"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("api_platforms", sa.Column("connection_draft", postgresql.JSONB()))
    op.add_column("api_platforms", sa.Column("connection_active", postgresql.JSONB()))
    op.add_column("api_platforms", sa.Column("connection_secrets_encrypted", sa.Text()))
    op.add_column("api_platforms", sa.Column("connection_version", sa.Integer(), server_default="0", nullable=False))
    op.add_column("api_platforms", sa.Column("connection_state", sa.String(20), server_default="draft", nullable=False))
    op.add_column("api_platforms", sa.Column("connection_cutover_at", sa.DateTime(timezone=True)))
    op.create_table(
        "api_platform_connection_audits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("actor_staff_id", sa.Uuid()),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("config_version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("details", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_api_platform_connection_audits_project_id", "api_platform_connection_audits", ["project_id"])
    op.create_index("ix_api_platform_connection_audits_platform_id", "api_platform_connection_audits", ["platform_id"])
    op.create_table(
        "api_platform_connection_gaps",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("device_id", sa.String(255)),
        sa.Column("reason", sa.String(100), server_default="offline", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_connection_gap_open", "api_platform_connection_gaps", ["platform_id", "device_id"], unique=True, postgresql_where=sa.text("ended_at IS NULL"))
    op.create_table(
        "api_platform_data_reset_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("platform_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_staff_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("api_staff.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(30), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("preview_counts", postgresql.JSONB()), sa.Column("result", postgresql.JSONB()), sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_platform_data_reset_jobs_project_id", "api_platform_data_reset_jobs", ["project_id"])
    op.create_index("ix_platform_data_reset_jobs_platform_id", "api_platform_data_reset_jobs", ["platform_id"])


def downgrade() -> None:
    op.drop_index("ix_platform_data_reset_jobs_platform_id", table_name="api_platform_data_reset_jobs")
    op.drop_index("ix_platform_data_reset_jobs_project_id", table_name="api_platform_data_reset_jobs")
    op.drop_table("api_platform_data_reset_jobs")
    op.drop_index("ix_platform_connection_gap_open", table_name="api_platform_connection_gaps")
    op.drop_table("api_platform_connection_gaps")
    op.drop_index("ix_api_platform_connection_audits_platform_id", table_name="api_platform_connection_audits")
    op.drop_index("ix_api_platform_connection_audits_project_id", table_name="api_platform_connection_audits")
    op.drop_table("api_platform_connection_audits")
    op.drop_column("api_platforms", "connection_cutover_at")
    op.drop_column("api_platforms", "connection_state")
    op.drop_column("api_platforms", "connection_version")
    op.drop_column("api_platforms", "connection_secrets_encrypted")
    op.drop_column("api_platforms", "connection_active")
    op.drop_column("api_platforms", "connection_draft")
