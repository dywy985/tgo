"""link reply-monitor batches to automatically created tickets

Revision ID: 0034_reply_monitor_tickets
Revises: 0033_reply_monitor_unique
"""

from alembic import op
import sqlalchemy as sa


revision = "0034_reply_monitor_tickets"
down_revision = "0033_reply_monitor_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Ticket numbers were documented as project-unique but older schemas did
    # not enforce that invariant. Preserve the first value and deterministically
    # rename legacy duplicates before installing the constraint.
    op.execute(
        """
        WITH ranked AS (
            SELECT id, row_number() OVER (
                PARTITION BY project_id, number ORDER BY created_at, id
            ) AS duplicate_rank
            FROM api_tickets
        )
        UPDATE api_tickets AS ticket
        SET number = left(ticket.number, 22) || '-D' ||
            left(replace(ticket.id::text, '-', ''), 8)
        FROM ranked
        WHERE ticket.id = ranked.id AND ranked.duplicate_rank > 1
        """
    )
    op.create_unique_constraint(
        "uq_tickets_project_number", "api_tickets", ["project_id", "number"]
    )
    op.add_column(
        "api_reply_monitor_batches",
        sa.Column("ticket_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "api_reply_monitor_batches",
        sa.Column("is_problem_candidate", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        "api_reply_monitor_events",
        sa.Column("responsible_staff_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_reply_monitor_event_responsible_staff",
        "api_reply_monitor_events",
        "api_staff",
        ["responsible_staff_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        """
        UPDATE api_reply_monitor_events AS event
        SET responsible_staff_id = batch.responsible_staff_id
        FROM api_reply_monitor_batches AS batch
        WHERE event.batch_id = batch.id
          AND event.responsible_staff_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE api_reply_monitor_batches AS batch
        SET is_problem_candidate = true
        WHERE EXISTS (
            SELECT 1 FROM api_reply_monitor_events AS event
            WHERE event.batch_id = batch.id
              AND (event.metadata ->> 'problem_score') ~ '^[0-9]+$'
              AND (event.metadata ->> 'problem_score')::integer >=
                  CASE
                      WHEN (event.metadata ->> 'problem_threshold') ~ '^[0-9]+$'
                      THEN (event.metadata ->> 'problem_threshold')::integer
                      ELSE 50
                  END
        )
        """
    )
    op.create_foreign_key(
        "fk_reply_monitor_batch_ticket",
        "api_reply_monitor_batches",
        "api_tickets",
        ["ticket_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_reply_monitor_batch_ticket",
        "api_reply_monitor_batches",
        ["ticket_id"],
    )
    op.drop_constraint("chk_tickets_source", "api_tickets", type_="check")
    op.create_check_constraint(
        "chk_tickets_source",
        "api_tickets",
        "source IN ('ai_auto', 'manual_service', 'staff_manual', 'public_form', 'reply_monitor')",
    )


def downgrade() -> None:
    op.execute("UPDATE api_tickets SET source = 'staff_manual' WHERE source = 'reply_monitor'")
    op.drop_constraint("chk_tickets_source", "api_tickets", type_="check")
    op.create_check_constraint(
        "chk_tickets_source",
        "api_tickets",
        "source IN ('ai_auto', 'manual_service', 'staff_manual', 'public_form')",
    )
    op.drop_constraint(
        "uq_reply_monitor_batch_ticket",
        "api_reply_monitor_batches",
        type_="unique",
    )
    op.drop_constraint(
        "fk_reply_monitor_batch_ticket",
        "api_reply_monitor_batches",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_reply_monitor_event_responsible_staff",
        "api_reply_monitor_events",
        type_="foreignkey",
    )
    op.drop_column("api_reply_monitor_events", "responsible_staff_id")
    op.drop_column("api_reply_monitor_batches", "ticket_id")
    op.drop_column("api_reply_monitor_batches", "is_problem_candidate")
    op.drop_constraint(
        "uq_tickets_project_number", "api_tickets", type_="unique"
    )
