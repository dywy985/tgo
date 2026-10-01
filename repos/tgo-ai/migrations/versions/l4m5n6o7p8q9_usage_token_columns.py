"""ensure usage token aggregation columns exist

Revision ID: l4m5n6o7p8q9
Revises: k3l4m5n6o7p8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l4m5n6o7p8q9"
down_revision: Union[str, None] = "k3l4m5n6o7p8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Production installations may already have run the legacy SQL script, so
    # this migration intentionally remains idempotent.
    op.execute(sa.text("""
        ALTER TABLE ai_agent_usage_records
            ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS completion_tokens INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0
    """))
    op.execute(sa.text("""
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'ai_agent_usage_records_project_agent_period_key'
          ) THEN
            ALTER TABLE ai_agent_usage_records
              ADD CONSTRAINT ai_agent_usage_records_project_agent_period_key
              UNIQUE (project_id, agent_id, period_start, aggregation_type);
          END IF;
        END $$
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE ai_agent_usage_records
          DROP CONSTRAINT IF EXISTS ai_agent_usage_records_project_agent_period_key,
          DROP COLUMN IF EXISTS total_tokens,
          DROP COLUMN IF EXISTS completion_tokens,
          DROP COLUMN IF EXISTS prompt_tokens
    """))
