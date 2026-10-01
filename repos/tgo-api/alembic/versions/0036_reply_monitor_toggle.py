"""add reply-monitor reminder delivery toggle

Revision ID: 0036_reply_monitor_toggle
Revises: 0035_reply_monitor_media
"""

from alembic import op
import sqlalchemy as sa


revision = "0036_reply_monitor_toggle"
down_revision = "0035_reply_monitor_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_reply_monitor_settings",
        sa.Column(
            "reminders_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("api_reply_monitor_settings", "reminders_enabled")
