"""group customer roster and responder display identity

Revision ID: 0041_group_customers
Revises: 0040_monitor_media_capture
"""

from alembic import op
import sqlalchemy as sa


revision = "0041_group_customers"
down_revision = "0040_monitor_media_capture"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_reply_monitor_batches",
        sa.Column("actual_reply_name", sa.String(255), nullable=True),
    )
    op.create_table(
        "api_reply_monitor_group_customers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_key", sa.String(255), nullable=False),
        sa.Column("identity_type", sa.String(20), nullable=False),
        sa.Column("identity_value", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("identity_type IN ('userid', 'name')", name="chk_reply_monitor_group_customer_identity_type"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id", "platform_id", "conversation_key", "identity_type", "identity_value",
            name="uq_reply_monitor_group_customer_identity",
        ),
    )
    op.create_index(
        "ix_reply_monitor_group_customer_lookup",
        "api_reply_monitor_group_customers",
        ["project_id", "platform_id", "conversation_key"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_reply_monitor_group_customer_lookup",
        table_name="api_reply_monitor_group_customers",
    )
    op.drop_table("api_reply_monitor_group_customers")
    op.drop_column("api_reply_monitor_batches", "actual_reply_name")
