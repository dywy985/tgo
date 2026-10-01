"""migrate legacy tickets to the reply-monitor workflow without data loss

Revision ID: 0037_monitor_ticket_workflow
Revises: 0036_reply_monitor_toggle

Existing tickets, comments, attachments and status history are preserved.
"""

from alembic import op
import sqlalchemy as sa


revision = "0037_monitor_ticket_workflow"
down_revision = "0036_reply_monitor_toggle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("chk_tickets_status", "api_tickets", type_="check")
    op.drop_constraint("chk_tickets_source", "api_tickets", type_="check")
    op.drop_constraint("chk_tickets_resolve_type", "api_tickets", type_="check")
    op.add_column("api_tickets", sa.Column("replied_at", sa.DateTime(), nullable=True))
    op.add_column("api_tickets", sa.Column("archived_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE api_tickets
           SET replied_at = COALESCE(first_response_at, resolved_at, closed_at),
               archived_at = CASE
                   WHEN status IN ('resolved', 'closed', 'rejected')
                   THEN COALESCE(closed_at, resolved_at, updated_at, created_at)
                   ELSE NULL
               END,
               status = CASE
                   WHEN status IN ('resolved', 'closed', 'rejected') THEN 'archived'
                   WHEN first_response_at IS NOT NULL THEN 'replied'
                   ELSE 'pending_reply'
               END,
               source = 'reply_monitor'
        """
    )
    op.drop_column("api_tickets", "resolve_type")
    op.drop_column("api_tickets", "resolved_at")
    op.drop_column("api_tickets", "closed_at")
    op.create_check_constraint(
        "chk_tickets_status",
        "api_tickets",
        "status IN ('pending_reply', 'replied', 'archived')",
    )
    op.create_check_constraint(
        "chk_tickets_source", "api_tickets", "source = 'reply_monitor'"
    )
    op.alter_column("api_tickets", "status", server_default="pending_reply")
    op.alter_column("api_tickets", "source", server_default="reply_monitor")

    # Make every unanswered candidate immediately eligible for the normal
    # idempotent scan, which recreates exactly one pending_reply ticket.
    op.execute(
        """
        UPDATE api_reply_monitor_batches
           SET next_reminder_at = COALESCE(next_reminder_at, NOW()),
               updated_at = NOW()
         WHERE status = 'pending' AND is_problem_candidate = TRUE
        """
    )


def downgrade() -> None:
    op.drop_constraint("chk_tickets_status", "api_tickets", type_="check")
    op.drop_constraint("chk_tickets_source", "api_tickets", type_="check")
    op.add_column("api_tickets", sa.Column("resolve_type", sa.String(length=30), nullable=True))
    op.add_column("api_tickets", sa.Column("resolved_at", sa.DateTime(), nullable=True))
    op.add_column("api_tickets", sa.Column("closed_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE api_tickets
           SET status = CASE
                   WHEN status = 'archived' THEN 'closed'
                   WHEN status = 'replied' THEN 'resolved'
                   ELSE 'open'
               END,
               resolved_at = CASE WHEN status = 'replied' THEN replied_at ELSE NULL END,
               closed_at = CASE WHEN status = 'archived' THEN archived_at ELSE NULL END,
               resolve_type = CASE
                   WHEN status IN ('replied', 'archived') THEN 'human_resolved'
                   ELSE 'unresolved'
               END
        """
    )
    op.drop_column("api_tickets", "archived_at")
    op.drop_column("api_tickets", "replied_at")
    op.create_check_constraint(
        "chk_tickets_status",
        "api_tickets",
        "status IN ('open', 'waiting_customer', 'pending_human', 'processing', 'resolved', 'closed', 'rejected')",
    )
    op.create_check_constraint(
        "chk_tickets_source",
        "api_tickets",
        "source IN ('ai_auto', 'manual_service', 'staff_manual', 'public_form', 'reply_monitor')",
    )
    op.create_check_constraint(
        "chk_tickets_resolve_type",
        "api_tickets",
        "resolve_type IN ('ai_resolved', 'human_resolved', 'unresolved', 'auto_closed')",
    )
    op.alter_column("api_tickets", "status", server_default="open")
    op.alter_column("api_tickets", "source", server_default="staff_manual")
