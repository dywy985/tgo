"""Read-only model mapping for the AI service's agent usage records.

The `ai_agent_usage_records` table is owned by the tgo-ai service, but since all
services share the same PostgreSQL database, the stats module in tgo-api can
read it directly for the monitoring dashboard (AI request volume / success rate /
average response time).

This model is intentionally minimal and read-only: tgo-api never writes to it,
and Alembic migrations for tgo-api must NOT create/drop this table (it is
managed by tgo-ai's migrations). Use raw table name via __table__ to avoid
metadata collision confusion; autogenerate will treat it as existing.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgentUsageRecord(Base):
    """Read-only view of ai_agent_usage_records (aggregated agent metrics)."""

    __tablename__ = "ai_agent_usage_records"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    project_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    agent_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    request_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    success_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_request_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    aggregation_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="hourly/daily/weekly/monthly")

    # Extra column present in the table (not used by stats, kept for safety when
    # reading rows with select-in only; no need to map everything).
    __mapper_args__ = {"eager_defaults": True}

    def __repr__(self) -> str:
        return (
            f"<AgentUsageRecord(id={self.id}, project_id={self.project_id}, "
            f"period='{self.aggregation_type}', requests={self.request_count})>"
        )
