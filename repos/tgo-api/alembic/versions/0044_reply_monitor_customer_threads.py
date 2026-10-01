"""isolate reply-monitor batches by customer and persist quote audit fields

Revision ID: 0044_reply_monitor_customer
Revises: 0043_wecom_identity_autobind
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0044_reply_monitor_customer"
down_revision = "0043_wecom_identity_autobind"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "api_reply_monitor_group_policies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_key", sa.String(255), nullable=False),
        sa.Column("roster_version", sa.Integer(), server_default="0", nullable=False),
        sa.Column("roster_confirmed", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("confirmed_by_staff_id", sa.Uuid()),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("observed_member_keys", postgresql.JSONB(), server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["confirmed_by_staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id", "platform_id", "conversation_key",
            name="uq_reply_monitor_group_policy",
        ),
    )
    op.create_table(
        "api_reply_monitor_rebuild_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("platform_id", sa.Uuid(), nullable=False),
        sa.Column("requested_by_staff_id", sa.Uuid()),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("snapshot", sa.String(64), nullable=False),
        sa.Column("status", sa.String(20), server_default="running", nullable=False),
        sa.Column("result", postgresql.JSONB(), server_default="{}", nullable=False),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["project_id"], ["api_projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["platform_id"], ["api_platforms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_staff_id"], ["api_staff.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reply_monitor_rebuild_jobs_project_id",
        "api_reply_monitor_rebuild_jobs", ["project_id"], unique=False,
    )

    for name, column in (
        ("current_content", sa.Column("current_content", sa.Text())),
        ("normalized_content", sa.Column("normalized_content", sa.Text())),
        ("problem_rule_version", sa.Column("problem_rule_version", sa.String(64))),
        ("problem_reasons", sa.Column("problem_reasons", postgresql.JSONB())),
        ("quoted_sender_id", sa.Column("quoted_sender_id", sa.String(255))),
        ("quoted_sender_name", sa.Column("quoted_sender_name", sa.String(255))),
        ("quoted_content", sa.Column("quoted_content", sa.Text())),
        ("quoted_message_type", sa.Column("quoted_message_type", sa.String(30))),
        ("quote_target_event_id", sa.Column("quote_target_event_id", sa.Uuid())),
        ("reply_match_status", sa.Column("reply_match_status", sa.String(30), server_default="not_applicable", nullable=False)),
        ("reply_actor_kind", sa.Column("reply_actor_kind", sa.String(30))),
    ):
        op.add_column("api_reply_monitor_events", column)
    op.create_foreign_key(
        "fk_reply_monitor_event_quote_target",
        "api_reply_monitor_events", "api_reply_monitor_events",
        ["quote_target_event_id"], ["id"], ondelete="SET NULL",
    )

    op.add_column("api_reply_monitor_batches", sa.Column("customer_identity_key", sa.String(520)))
    op.add_column("api_reply_monitor_batches", sa.Column("customer_sender_id", sa.String(255)))
    op.add_column("api_reply_monitor_batches", sa.Column("customer_sender_name", sa.String(255)))
    op.add_column("api_reply_monitor_batches", sa.Column("reply_actor_kind", sa.String(30)))
    op.add_column(
        "api_reply_monitor_batches",
        sa.Column("reply_match_status", sa.String(30), server_default="not_applicable", nullable=False),
    )
    op.add_column(
        "api_reply_monitor_batches",
        sa.Column("review_required", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.execute("""
        WITH first_events AS (
            SELECT DISTINCT ON (event.batch_id)
                   event.batch_id, event.sender_id, event.sender_name
            FROM api_reply_monitor_events AS event
            WHERE event.sender_kind = 'customer' AND event.batch_id IS NOT NULL
            ORDER BY event.batch_id, event.occurred_at ASC
        )
        UPDATE api_reply_monitor_batches AS batch
        SET customer_sender_id = first_event.sender_id,
            customer_sender_name = first_event.sender_name,
            customer_identity_key = CASE
                WHEN NULLIF(btrim(first_event.sender_id), '') IS NOT NULL
                    THEN 'userid:' || lower(btrim(first_event.sender_id))
                WHEN NULLIF(btrim(first_event.sender_name), '') IS NOT NULL
                    THEN 'name:' || lower(btrim(first_event.sender_name))
                ELSE 'conversation:' || lower(btrim(batch.conversation_key)) || ':legacy:' || batch.id::text
            END
        FROM first_events AS first_event
        WHERE first_event.batch_id = batch.id
    """)
    op.execute("""
        UPDATE api_reply_monitor_batches
        SET customer_identity_key = 'conversation:' || lower(btrim(conversation_key)) || ':legacy:' || id::text
        WHERE customer_identity_key IS NULL
    """)
    op.alter_column("api_reply_monitor_batches", "customer_identity_key", nullable=False)
    op.drop_index("uq_reply_monitor_one_pending_batch", table_name="api_reply_monitor_batches")
    op.create_index(
        "uq_reply_monitor_one_pending_batch", "api_reply_monitor_batches",
        ["project_id", "platform_id", "conversation_key", "customer_identity_key"],
        unique=True, postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_reply_monitor_one_pending_batch", table_name="api_reply_monitor_batches")
    op.create_index(
        "uq_reply_monitor_one_pending_batch", "api_reply_monitor_batches",
        ["project_id", "platform_id", "conversation_key"],
        unique=True, postgresql_where=sa.text("status = 'pending'"),
    )
    for column in (
        "review_required", "reply_match_status", "reply_actor_kind",
        "customer_sender_name", "customer_sender_id", "customer_identity_key",
    ):
        op.drop_column("api_reply_monitor_batches", column)
    op.drop_constraint(
        "fk_reply_monitor_event_quote_target", "api_reply_monitor_events", type_="foreignkey"
    )
    for column in (
        "reply_actor_kind", "reply_match_status", "quote_target_event_id",
        "quoted_message_type", "quoted_content", "quoted_sender_name", "quoted_sender_id",
        "problem_reasons", "problem_rule_version", "normalized_content", "current_content",
    ):
        op.drop_column("api_reply_monitor_events", column)
    op.drop_index(
        "ix_reply_monitor_rebuild_jobs_project_id",
        table_name="api_reply_monitor_rebuild_jobs",
    )
    op.drop_table("api_reply_monitor_rebuild_jobs")
    op.drop_table("api_reply_monitor_group_policies")
