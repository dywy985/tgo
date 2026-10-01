"""Human reply monitoring persistence models."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


DEFAULT_WEEKLY_SCHEDULE = {
    "0": [{"start": "09:00", "end": "18:00"}],
    "1": [{"start": "09:00", "end": "18:00"}],
    "2": [{"start": "09:00", "end": "18:00"}],
    "3": [{"start": "09:00", "end": "18:00"}],
    "4": [{"start": "09:00", "end": "18:00"}],
    "5": [],
    "6": [],
}


class ReplyMonitorSettings(Base):
    __tablename__ = "api_reply_monitor_settings"

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), primary_key=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Shanghai")
    weekly_schedule: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=lambda: dict(DEFAULT_WEEKLY_SCHEDULE)
    )
    first_reminder_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    repeat_reminder_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_reminders: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    wecom_digest_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    wecom_digest_max_items: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    notification_channels: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=lambda: {"in_app": True, "wecom_app": True}
    )
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())


class ReplyMonitorEvent(Base):
    __tablename__ = "api_reply_monitor_events"
    __table_args__ = (
        UniqueConstraint("platform_id", "message_id", name="uq_reply_monitor_platform_message"),
        Index("ix_reply_monitor_event_project_time", "project_id", "occurred_at"),
        Index("ix_reply_monitor_event_conversation", "project_id", "conversation_key", "occurred_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False)
    platform_id: Mapped[UUID] = mapped_column(ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False)
    batch_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_reply_monitor_batches.id", ondelete="SET NULL"))
    resolved_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    responsible_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    message_id: Mapped[str] = mapped_column(String(255), nullable=False)
    robot_id: Mapped[Optional[str]] = mapped_column(String(255))
    conversation_key: Mapped[str] = mapped_column(String(255), nullable=False)
    conversation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    conversation_name: Mapped[Optional[str]] = mapped_column(String(255))
    channel_open_id: Mapped[Optional[str]] = mapped_column(String(255))
    sender_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    sender_id: Mapped[Optional[str]] = mapped_column(String(255))
    sender_name: Mapped[Optional[str]] = mapped_column(String(255))
    message_type: Mapped[str] = mapped_column(String(30), nullable=False, default="text")
    content_summary: Mapped[Optional[str]] = mapped_column(Text)
    current_content: Mapped[Optional[str]] = mapped_column(Text)
    normalized_content: Mapped[Optional[str]] = mapped_column(Text)
    problem_rule_version: Mapped[Optional[str]] = mapped_column(String(64))
    problem_reasons: Mapped[Optional[list[str]]] = mapped_column(JSONB)
    quoted_sender_id: Mapped[Optional[str]] = mapped_column(String(255))
    quoted_sender_name: Mapped[Optional[str]] = mapped_column(String(255))
    quoted_content: Mapped[Optional[str]] = mapped_column(Text)
    quoted_message_type: Mapped[Optional[str]] = mapped_column(String(30))
    quote_target_event_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_reply_monitor_events.id", ondelete="SET NULL")
    )
    reply_match_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="not_applicable"
    )
    reply_actor_kind: Mapped[Optional[str]] = mapped_column(String(30))
    event_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column("metadata", JSONB)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class ReplyMonitorBatch(Base):
    __tablename__ = "api_reply_monitor_batches"
    __table_args__ = (
        Index("ix_reply_monitor_batch_pending", "project_id", "status", "next_reminder_at"),
        Index("ix_reply_monitor_batch_conversation", "project_id", "platform_id", "conversation_key", "status"),
        Index(
            "uq_reply_monitor_one_pending_batch",
            "project_id", "platform_id", "conversation_key", "customer_identity_key",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False)
    platform_id: Mapped[UUID] = mapped_column(ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False)
    conversation_key: Mapped[str] = mapped_column(String(255), nullable=False)
    conversation_type: Mapped[str] = mapped_column(String(20), nullable=False)
    conversation_name: Mapped[Optional[str]] = mapped_column(String(255))
    customer_identity_key: Mapped[str] = mapped_column(String(520), nullable=False)
    customer_sender_id: Mapped[Optional[str]] = mapped_column(String(255))
    customer_sender_name: Mapped[Optional[str]] = mapped_column(String(255))
    channel_open_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    is_problem_candidate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    responsible_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    actual_reply_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    actual_reply_name: Mapped[Optional[str]] = mapped_column(String(255))
    reply_actor_kind: Mapped[Optional[str]] = mapped_column(String(30))
    reply_match_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="not_applicable"
    )
    review_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ticket_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_tickets.id", ondelete="SET NULL"), unique=True
    )
    first_customer_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_customer_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    first_reply_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    customer_message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reminder_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    next_reminder_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)


class ReplyMonitorGroupCustomer(Base):
    """A customer identity configured for one monitored WorkTool group."""

    __tablename__ = "api_reply_monitor_group_customers"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "platform_id", "conversation_key", "identity_type", "identity_value",
            name="uq_reply_monitor_group_customer_identity",
        ),
        Index(
            "ix_reply_monitor_group_customer_lookup",
            "project_id", "platform_id", "conversation_key",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )
    platform_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False
    )
    conversation_key: Mapped[str] = mapped_column(String(255), nullable=False)
    identity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    identity_value: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )


class ReplyMonitorGroupPolicy(Base):
    """Atomic confirmation and audit state for one WorkTool customer roster."""

    __tablename__ = "api_reply_monitor_group_policies"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "platform_id", "conversation_key",
            name="uq_reply_monitor_group_policy",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )
    platform_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False
    )
    conversation_key: Mapped[str] = mapped_column(String(255), nullable=False)
    roster_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    roster_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confirmed_by_staff_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_staff.id", ondelete="SET NULL")
    )
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    observed_member_keys: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )


class ReplyMonitorRebuildJob(Base):
    """Durable audit record for an operator-approved historical rebuild."""

    __tablename__ = "api_reply_monitor_rebuild_jobs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False
    )
    requested_by_staff_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_staff.id", ondelete="SET NULL")
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    snapshot: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ReplyMonitorReminder(Base):
    __tablename__ = "api_reply_monitor_reminders"
    __table_args__ = (
        UniqueConstraint("batch_id", "sequence", "channel", "recipient_staff_id", name="uq_reply_monitor_reminder_delivery"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    batch_id: Mapped[UUID] = mapped_column(ForeignKey("api_reply_monitor_batches.id", ondelete="CASCADE"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)
    recipient_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    digest_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_reply_monitor_digests.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class ReplyMonitorDigest(Base):
    """One persisted and idempotent WeCom aggregate delivery."""

    __tablename__ = "api_reply_monitor_digests"
    __table_args__ = (
        UniqueConstraint("idempotency_key", name="uq_reply_monitor_digest_key"),
        Index("ix_reply_monitor_digest_dispatch", "status", "window_start"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )
    recipient_staff_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_staff.id", ondelete="CASCADE"), nullable=False
    )
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    unassigned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    content_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )


class ReplyMonitorMedia(Base):
    """Sanitized media linked to a WorkTool monitor event and optional ticket."""

    __tablename__ = "api_reply_monitor_media"
    __table_args__ = (
        UniqueConstraint(
            "platform_id",
            "message_id",
            "sha256",
            name="uq_reply_monitor_media_platform_message_sha",
        ),
        Index("ix_reply_monitor_media_event", "event_id", "created_at"),
        Index("ix_reply_monitor_media_expiry", "status", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )
    platform_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_reply_monitor_events.id", ondelete="CASCADE"), nullable=False
    )
    batch_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_reply_monitor_batches.id", ondelete="SET NULL")
    )
    ticket_attachment_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_ticket_attachments.id", ondelete="SET NULL"), unique=True
    )
    message_id: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ready")
    capture_source: Mapped[str] = mapped_column(String(32), nullable=False, default="cache")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )


class PlatformConnectionAudit(Base):
    """Append-only record of channel configuration and cutover operations."""

    __tablename__ = "api_platform_connection_audits"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    platform_id: Mapped[UUID] = mapped_column(ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    config_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    details: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class WeComIdentitySettings(Base):
    """Automatic WeCom identity matching settings for one managed bot."""

    __tablename__ = "api_wecom_identity_settings"

    platform_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_platforms.id", ondelete="CASCADE"), primary_key=True
    )
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    auto_bind_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    match_fields: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=lambda: ["name", "nickname", "username"]
    )
    existing_binding_policy: Mapped[str] = mapped_column(
        String(20), nullable=False, default="replace"
    )
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_sync_status: Mapped[str] = mapped_column(String(20), nullable=False, default="never")
    last_sync_error: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )


class WeComDiscoveredIdentity(Base):
    """Private-chat identity metadata; message bodies are never persisted here."""

    __tablename__ = "api_wecom_discovered_identities"
    __table_args__ = (
        UniqueConstraint("platform_id", "normalized_userid", name="uq_wecom_identity_platform_userid"),
        Index("ix_wecom_identity_project_status", "project_id", "status"),
        Index("ix_wecom_identity_platform_seen", "platform_id", "last_seen"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False
    )
    platform_id: Mapped[UUID] = mapped_column(
        ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False
    )
    userid: Mapped[str] = mapped_column(String(128), nullable=False)
    normalized_userid: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(255))
    normalized_display_name: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="unmatched")
    bound_staff_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("api_staff.id", ondelete="SET NULL")
    )
    match_field: Mapped[Optional[str]] = mapped_column(String(30))
    match_reason: Mapped[Optional[str]] = mapped_column(Text)
    match_candidates: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    bound_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="aibot_long_connection")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False
    )


class PlatformConnectionGap(Base):
    """Persisted interval in which an active message device was unavailable."""

    __tablename__ = "api_platform_connection_gaps"
    __table_args__ = (Index("ix_platform_connection_gap_open", "platform_id", "device_id", unique=True, postgresql_where=text("ended_at IS NULL")),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False)
    platform_id: Mapped[UUID] = mapped_column(ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False)
    device_id: Mapped[Optional[str]] = mapped_column(String(255))
    reason: Mapped[str] = mapped_column(String(100), nullable=False, default="offline")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class PlatformDataResetJob(Base):
    """Auditable asynchronous platform-scoped reset progress."""

    __tablename__ = "api_platform_data_reset_jobs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    platform_id: Mapped[UUID] = mapped_column(ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    operation: Mapped[str] = mapped_column(String(40), nullable=False, default="platform_data_reset")
    target_ids: Mapped[Optional[list[str]]] = mapped_column(JSONB)
    preview_counts: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    result: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class WeComConversationBinding(Base):
    """Verified transport binding; chat id is never a monitor business key."""

    __tablename__ = "api_wecom_conversation_bindings"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "platform_id", "conversation_key",
            name="uq_wecom_binding_business_conversation",
        ),
        Index("ix_wecom_binding_project_status", "project_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False)
    platform_id: Mapped[UUID] = mapped_column(ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False)
    robot_id: Mapped[Optional[str]] = mapped_column(String(255))
    conversation_key: Mapped[str] = mapped_column(String(255), nullable=False)
    conversation_name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(255), nullable=False)
    wecom_chat_id: Mapped[Optional[str]] = mapped_column(String(255))
    owner_userid: Mapped[Optional[str]] = mapped_column(String(255))
    member_fingerprint: Mapped[Optional[str]] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="syncing")
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="externalcontact_api")
    reason: Mapped[Optional[str]] = mapped_column(Text)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now(), nullable=False)


class WeComJumpGrant(Base):
    """Five-minute, staff-bound, single-use grant for the WeCom H5 page."""

    __tablename__ = "api_wecom_jump_grants"
    __table_args__ = (Index("ix_wecom_jump_grant_expiry", "expires_at", "used_at"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False)
    binding_id: Mapped[UUID] = mapped_column(ForeignKey("api_wecom_conversation_bindings.id", ondelete="CASCADE"), nullable=False)
    staff_id: Mapped[UUID] = mapped_column(ForeignKey("api_staff.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)


class ReplyMonitorMediaRecoveryJob(Base):
    """Administrator-started, bounded phone recovery operation."""

    __tablename__ = "api_reply_monitor_media_recovery_jobs"
    __table_args__ = (Index("ix_media_recovery_job_project_status", "project_id", "status"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False)
    platform_id: Mapped[UUID] = mapped_column(ForeignKey("api_platforms.id", ondelete="CASCADE"), nullable=False)
    actor_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_event_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    result: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    error: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ReplyMonitorMediaRecoveryCandidate(Base):
    """Quarantined image candidate awaiting an administrator decision."""

    __tablename__ = "api_reply_monitor_media_recovery_candidates"
    __table_args__ = (
        UniqueConstraint("job_id", "event_id", "sha256", name="uq_media_recovery_candidate"),
        Index("ix_media_recovery_candidate_project_status", "project_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(ForeignKey("api_projects.id", ondelete="CASCADE"), nullable=False)
    job_id: Mapped[UUID] = mapped_column(ForeignKey("api_reply_monitor_media_recovery_jobs.id", ondelete="CASCADE"), nullable=False)
    event_id: Mapped[UUID] = mapped_column(ForeignKey("api_reply_monitor_events.id", ondelete="CASCADE"), nullable=False)
    message_id: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    capture_source: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    evidence: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    reviewed_by_staff_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("api_staff.id", ondelete="SET NULL"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), nullable=False)
