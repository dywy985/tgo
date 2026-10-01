"""wecom exact jump bindings and quarantined media recovery

Revision ID: 0042_wecom_jump_recovery
Revises: 0041_group_customers
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0042_wecom_jump_recovery"
down_revision = "0041_group_customers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("api_reply_monitor_media", "capture_source", type_=sa.String(32), existing_type=sa.String(20), existing_nullable=False)
    op.create_table(
        "api_wecom_conversation_bindings",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False), sa.Column("robot_id", sa.String(255)),
        sa.Column("conversation_key", sa.String(255), nullable=False), sa.Column("conversation_name", sa.String(255), nullable=False),
        sa.Column("normalized_name", sa.String(255), nullable=False), sa.Column("wecom_chat_id", sa.String(255)),
        sa.Column("owner_userid", sa.String(255)), sa.Column("member_fingerprint", sa.String(64)),
        sa.Column("status", sa.String(20), server_default="syncing", nullable=False),
        sa.Column("source", sa.String(40), server_default="externalcontact_api", nullable=False),
        sa.Column("reason", sa.Text()), sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "platform_id", "conversation_key", name="uq_wecom_binding_business_conversation"),
    )
    op.create_index("ix_wecom_binding_project_status", "api_wecom_conversation_bindings", ["project_id", "status"])
    op.create_table(
        "api_wecom_jump_grants",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("binding_id", sa.Uuid(), nullable=False), sa.Column("staff_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["binding_id"], ["api_wecom_conversation_bindings.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_id"], ["api_staff.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_wecom_jump_grant_expiry", "api_wecom_jump_grants", ["expires_at", "used_at"])
    op.create_table(
        "api_reply_monitor_media_recovery_jobs",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False), sa.Column("actor_staff_id", sa.Uuid()),
        sa.Column("status", sa.String(30), server_default="queued", nullable=False),
        sa.Column("progress", sa.Integer(), server_default="0", nullable=False),
        sa.Column("target_event_ids", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("cancel_requested", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text())), sa.Column("error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_staff_id"], ["api_staff.id"], ondelete="SET NULL"), sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_media_recovery_job_project_status", "api_reply_monitor_media_recovery_jobs", ["project_id", "status"])
    op.create_table(
        "api_reply_monitor_media_recovery_candidates",
        sa.Column("id", sa.Uuid(), nullable=False), sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False), sa.Column("event_id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.String(255), nullable=False), sa.Column("storage_path", sa.String(1024), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False), sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False), sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False), sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("capture_source", sa.String(32), nullable=False), sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text())), sa.Column("reviewed_by_staff_id", sa.Uuid()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["api_reply_monitor_media_recovery_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["api_reply_monitor_events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by_staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"), sa.UniqueConstraint("job_id", "event_id", "sha256", name="uq_media_recovery_candidate"),
    )
    op.create_index("ix_media_recovery_candidate_project_status", "api_reply_monitor_media_recovery_candidates", ["project_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_media_recovery_candidate_project_status", table_name="api_reply_monitor_media_recovery_candidates")
    op.drop_table("api_reply_monitor_media_recovery_candidates")
    op.drop_index("ix_media_recovery_job_project_status", table_name="api_reply_monitor_media_recovery_jobs")
    op.drop_table("api_reply_monitor_media_recovery_jobs")
    op.drop_index("ix_wecom_jump_grant_expiry", table_name="api_wecom_jump_grants")
    op.drop_table("api_wecom_jump_grants")
    op.drop_index("ix_wecom_binding_project_status", table_name="api_wecom_conversation_bindings")
    op.drop_table("api_wecom_conversation_bindings")
    op.alter_column("api_reply_monitor_media", "capture_source", type_=sa.String(20), existing_type=sa.String(32), existing_nullable=False)
