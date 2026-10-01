"""WeCom private identity discovery and automatic binding

Revision ID: 0043_wecom_identity_autobind
Revises: 0042_wecom_jump_recovery
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0043_wecom_identity_autobind"
down_revision = "0042_wecom_jump_recovery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fail before changing any existing binding. The exception itself is the
    # operator's conflict list and makes the migration safe to retry.
    op.execute("""
    DO $$
    DECLARE conflicts text;
    BEGIN
      SELECT string_agg(project_id::text || ':' || lower(wecom_userid) || '=[' || ids || ']', E'\n')
      INTO conflicts
      FROM (
        SELECT project_id, lower(wecom_userid) AS wecom_userid,
               string_agg(id::text, ', ' ORDER BY id::text) AS ids
        FROM api_staff
        WHERE deleted_at IS NULL AND wecom_userid IS NOT NULL AND btrim(wecom_userid) <> ''
        GROUP BY project_id, lower(wecom_userid)
        HAVING count(*) > 1
      ) duplicates;
      IF conflicts IS NOT NULL THEN
        RAISE EXCEPTION 'duplicate active WeCom UserID bindings must be resolved before migration:%', E'\n' || conflicts;
      END IF;
    END $$;
    """)
    op.create_index(
        "uq_api_staff_project_wecom_userid_ci_active", "api_staff",
        ["project_id", sa.text("lower(wecom_userid)")], unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND wecom_userid IS NOT NULL AND btrim(wecom_userid) <> ''"),
    )
    op.create_table(
        "api_wecom_identity_settings",
        sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("auto_bind_enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("match_fields", postgresql.JSONB(), server_default='["name","nickname","username"]', nullable=False),
        sa.Column("existing_binding_policy", sa.String(20), server_default="replace", nullable=False),
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
        sa.Column("last_sync_status", sa.String(20), server_default="never", nullable=False),
        sa.Column("last_sync_error", sa.Text()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("platform_id"),
    )
    op.create_index("ix_api_wecom_identity_settings_project_id", "api_wecom_identity_settings", ["project_id"])
    op.create_table(
        "api_wecom_discovered_identities",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("userid", sa.String(128), nullable=False),
        sa.Column("normalized_userid", sa.String(128), nullable=False),
        sa.Column("display_name", sa.String(255)),
        sa.Column("normalized_display_name", sa.String(255)),
        sa.Column("status", sa.String(30), server_default="unmatched", nullable=False),
        sa.Column("bound_staff_id", sa.Uuid()),
        sa.Column("match_field", sa.String(30)),
        sa.Column("match_reason", sa.Text()),
        sa.Column("match_candidates", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("bound_at", sa.DateTime(timezone=True)),
        sa.Column("source", sa.String(40), server_default="aibot_long_connection", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bound_staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("platform_id", "normalized_userid", name="uq_wecom_identity_platform_userid"),
    )
    op.create_index("ix_wecom_identity_project_status", "api_wecom_discovered_identities", ["project_id", "status"])
    op.create_index("ix_wecom_identity_platform_seen", "api_wecom_discovered_identities", ["platform_id", "last_seen"])


def downgrade() -> None:
    op.drop_index("ix_wecom_identity_platform_seen", table_name="api_wecom_discovered_identities")
    op.drop_index("ix_wecom_identity_project_status", table_name="api_wecom_discovered_identities")
    op.drop_table("api_wecom_discovered_identities")
    op.drop_index("ix_api_wecom_identity_settings_project_id", table_name="api_wecom_identity_settings")
    op.drop_table("api_wecom_identity_settings")
    op.drop_index("uq_api_staff_project_wecom_userid_ci_active", table_name="api_staff")
