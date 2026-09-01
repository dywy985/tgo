"""add public ticket form contact fields and attachments

Revision ID: 0031_public_ticket_form
Revises: 0030_assignment_routing
Create Date: 2026-09-01
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0031_public_ticket_form"
down_revision: Union[str, None] = "0030_assignment_routing"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("api_tickets", sa.Column("contact_name", sa.String(100), nullable=True))
    op.add_column("api_tickets", sa.Column("contact_phone", sa.String(32), nullable=True))
    op.drop_constraint("chk_tickets_source", "api_tickets", type_="check")
    op.create_check_constraint(
        "chk_tickets_source",
        "api_tickets",
        "source IN ('ai_auto', 'manual_service', 'staff_manual', 'public_form')",
    )
    op.create_table(
        "api_ticket_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("ticket_id", sa.Uuid(), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("storage_path", sa.String(1024), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_id"], ["api_tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ticket_attachments_ticket_created",
        "api_ticket_attachments",
        ["ticket_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_ticket_attachments_ticket_created", table_name="api_ticket_attachments")
    op.drop_table("api_ticket_attachments")
    op.execute("UPDATE api_tickets SET source = 'staff_manual' WHERE source = 'public_form'")
    op.drop_constraint("chk_tickets_source", "api_tickets", type_="check")
    op.create_check_constraint(
        "chk_tickets_source",
        "api_tickets",
        "source IN ('ai_auto', 'manual_service', 'staff_manual')",
    )
    op.drop_column("api_tickets", "contact_phone")
    op.drop_column("api_tickets", "contact_name")
