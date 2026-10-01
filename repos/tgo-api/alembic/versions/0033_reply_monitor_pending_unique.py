"""enforce one pending reply batch per conversation

Revision ID: 0033_reply_monitor_unique
Revises: 0032_reply_monitor
"""

from alembic import op
import sqlalchemy as sa

revision = "0033_reply_monitor_unique"
down_revision = "0032_reply_monitor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_reply_monitor_one_pending_batch",
        "api_reply_monitor_batches",
        ["project_id", "platform_id", "conversation_key"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_reply_monitor_one_pending_batch",
        table_name="api_reply_monitor_batches",
    )
