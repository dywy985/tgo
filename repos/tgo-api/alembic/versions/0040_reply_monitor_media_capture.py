"""reply monitor media capture source

Revision ID: 0040_monitor_media_capture
Revises: 0039_platform_connections
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0040_monitor_media_capture"
down_revision = "0039_platform_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_reply_monitor_media",
        sa.Column("capture_source", sa.String(20), nullable=False, server_default="cache"),
    )
    op.add_column(
        "api_platform_data_reset_jobs",
        sa.Column("operation", sa.String(40), nullable=False, server_default="platform_data_reset"),
    )
    op.add_column("api_platform_data_reset_jobs", sa.Column("target_ids", postgresql.JSONB()))


def downgrade() -> None:
    op.drop_column("api_platform_data_reset_jobs", "target_ids")
    op.drop_column("api_platform_data_reset_jobs", "operation")
    op.drop_column("api_reply_monitor_media", "capture_source")
