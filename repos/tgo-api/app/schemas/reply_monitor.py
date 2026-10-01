from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Literal, Optional
from uuid import UUID
import unicodedata

from pydantic import BaseModel, Field, field_validator


class ReplyMonitorEventCreate(BaseModel):
    message_id: str = Field(min_length=1, max_length=255)
    robot_id: Optional[str] = None
    conversation_key: str = Field(min_length=1, max_length=255)
    conversation_type: Literal["group", "private"]
    conversation_name: Optional[str] = None
    sender_kind: Literal["customer", "staff", "system", "unknown"]
    sender_id: Optional[str] = None
    sender_name: Optional[str] = None
    message_type: str = "text"
    content_summary: Optional[str] = None
    current_content: Optional[str] = None
    quoted_sender_id: Optional[str] = None
    quoted_sender_name: Optional[str] = None
    quoted_content: Optional[str] = None
    quoted_message_type: Optional[str] = None
    occurred_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)


class ReplyMonitorEventResult(BaseModel):
    duplicate: bool = False
    ignored: bool = False
    event_id: Optional[UUID] = None
    batch_id: Optional[UUID] = None
    reply_status: Optional[str] = None
    responsible_staff_id: Optional[UUID] = None
    actual_reply_staff_id: Optional[UUID] = None
    pending_reply_since: Optional[datetime] = None
    reminder_count: int = 0
    effective_sender_kind: Literal["customer", "staff", "system", "unknown"]
    effective_sender_name: Optional[str] = None
    reply_match_status: Literal[
        "not_applicable", "matched_quote", "matched_single", "matched_manual",
        "matched_self_resolution", "ambiguous", "unmatched"
    ] = "not_applicable"
    reply_actor_kind: Optional[Literal["staff", "customer_peer", "customer_self"]] = None


class ReplyMonitorOwnerChatBindRequest(BaseModel):
    visitor_id: UUID


class ReplyMonitorOwnerChatBindResult(BaseModel):
    bound: bool
    responsible_staff_id: Optional[UUID] = None
    reason: Optional[Literal["unassigned"]] = None


class ReplyMonitorSettingsUpdate(BaseModel):
    enabled: bool = True
    reminders_enabled: bool = True
    timezone: str = "Asia/Shanghai"
    weekly_schedule: dict[str, list[dict[str, str]]]
    first_reminder_minutes: int = Field(30, ge=1, le=1440)
    repeat_reminder_minutes: int = Field(60, ge=1, le=1440)
    max_reminders: int = Field(3, ge=0, le=20)
    wecom_digest_minutes: int = Field(5, ge=1, le=30)
    wecom_digest_max_items: int = Field(10, ge=1, le=20)
    notification_channels: dict[str, bool]
    @field_validator("weekly_schedule")
    @classmethod
    def validate_weekly_schedule(cls, value: dict[str, list[dict[str, str]]]):
        unknown = set(value) - {str(i) for i in range(7)}
        if unknown:
            raise ValueError(f"unknown weekday keys: {sorted(unknown)}")
        for ranges in value.values():
            for item in ranges:
                try:
                    start = time.fromisoformat(item["start"])
                    end = time.fromisoformat(item["end"])
                except (KeyError, TypeError, ValueError) as exc:
                    raise ValueError("work ranges require HH:MM start/end") from exc
                if start >= end:
                    raise ValueError("work range start must be before end")
        return value

    @field_validator("notification_channels")
    @classmethod
    def validate_notification_channels(cls, value: dict[str, bool]):
        allowed = {"in_app", "wecom_app"}
        if set(value) - allowed:
            raise ValueError("unsupported notification channel")
        if not any(value.values()):
            raise ValueError("at least one notification channel must be enabled")
        return value


class ReplyMonitorOwnerOverrideUpdate(BaseModel):
    staff_id: UUID


class ReplyMonitorReplyMatchReview(BaseModel):
    reply_event_id: UUID


class ReplyMonitorRebuildPreviewRequest(BaseModel):
    platform_id: UUID
    start_at: datetime
    end_at: datetime

    @field_validator("end_at")
    @classmethod
    def validate_end_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("end_at must include timezone")
        return value


class ReplyMonitorRebuildSubmitRequest(ReplyMonitorRebuildPreviewRequest):
    preview_token: str = Field(min_length=20)


class ReplyMonitorCustomerMemberInput(BaseModel):
    identity_type: Literal["userid", "name"]
    identity_value: str = Field(min_length=1, max_length=255)
    display_name: Optional[str] = Field(default=None, max_length=255)

    @field_validator("identity_value")
    @classmethod
    def normalize_identity(cls, value: str) -> str:
        normalized = " ".join(unicodedata.normalize("NFKC", value).split()).casefold()
        if not normalized:
            raise ValueError("identity_value cannot be blank")
        return normalized


class ReplyMonitorCustomerRosterUpdate(BaseModel):
    roster_confirmed: Literal[True]
    customer_members: list[ReplyMonitorCustomerMemberInput] = Field(max_length=200)

    @field_validator("customer_members")
    @classmethod
    def deduplicate_members(
        cls, value: list[ReplyMonitorCustomerMemberInput]
    ) -> list[ReplyMonitorCustomerMemberInput]:
        result = []
        seen = set()
        for member in value:
            key = (member.identity_type, member.identity_value)
            if key in seen:
                continue
            seen.add(key)
            result.append(member)
        return result


class ReplyMonitorStatsQuery(BaseModel):
    start_date: date
    end_date: date


class ReplyMonitorMediaResponse(BaseModel):
    id: UUID
    content_type: str
    file_size: int
    width: int
    height: int
    status: str
    url: str
    capture_source: Literal[
        "cache", "screen_crop", "recovered_cache", "recovered_screen_crop"
    ] = "cache"


class ReplyMonitorMediaResolveRequest(BaseModel):
    monitor_message_ids: list[str] = Field(min_length=1, max_length=100)

    @field_validator("monitor_message_ids")
    @classmethod
    def validate_message_ids(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        if not cleaned or len(cleaned) != len(value) or any(len(item) > 255 for item in cleaned):
            raise ValueError("monitor_message_ids contains an invalid id")
        return list(dict.fromkeys(cleaned))


class ReplyMonitorMediaResolveResult(BaseModel):
    items: dict[str, list[ReplyMonitorMediaResponse]]


class ReplyMonitorMediaUploadResult(BaseModel):
    duplicate: bool = False
    media: ReplyMonitorMediaResponse
    ocr_status: Optional[Literal["recognized", "no_text", "unavailable", "failed"]] = None
    ocr_text: Optional[str] = None
    problem_score: Optional[int] = None
    problem_batch_id: Optional[UUID] = None


class ReplyMonitorKnowledgeSuggestion(BaseModel):
    document_id: str
    collection_id: str
    collection_name: str
    title: str
    suggested_reply: str
    relevance_score: float


class ReplyMonitorKnowledgeSuggestionResult(BaseModel):
    status: Literal["ready", "empty", "unavailable"]
    query: str
    collection_count: int = 0
    items: list[ReplyMonitorKnowledgeSuggestion] = Field(default_factory=list)
    message: Optional[str] = None


class ReplyMonitorTimelineEvent(BaseModel):
    id: UUID
    message_id: str
    sender_kind: str
    sender_id: Optional[str] = None
    sender_name: Optional[str] = None
    responsible_staff_id: Optional[UUID] = None
    message_type: str
    content_summary: Optional[str] = None
    occurred_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)
    media: list[ReplyMonitorMediaResponse] = Field(default_factory=list)
    media_status: Literal["ready", "recovering", "missing", "failed"] = "ready"
    capture_source: Optional[Literal[
        "cache", "screen_crop", "recovered_cache", "recovered_screen_crop"
    ]] = None


class ReplyMonitorBatchContext(BaseModel):
    id: UUID
    status: str
    conversation_key: str
    conversation_type: str
    conversation_name: Optional[str] = None
    responsible_staff_id: Optional[UUID] = None
    actual_reply_staff_id: Optional[UUID] = None
    first_customer_at: datetime
    first_reply_at: Optional[datetime] = None
    reminder_count: int
    platform_id: UUID


class ReplyMonitorTicketContext(BaseModel):
    ticket_id: UUID
    ticket_number: str
    batch: ReplyMonitorBatchContext
    timeline: list[ReplyMonitorTimelineEvent]
    wecom_action: Literal["available", "syncing", "ambiguous", "unsupported"]
    can_dispatch_to_wecom: bool = False
    wecom_action_reason: Optional[str] = None


class WeComConversationActionRequest(BaseModel):
    platform_id: UUID
    conversation_key: str = Field(min_length=1, max_length=255)


class WeComConversationActionResponse(BaseModel):
    wecom_action: Literal["available", "syncing", "ambiguous", "unsupported"]
    can_dispatch_to_wecom: bool
    reason: Optional[str] = None
    jump_url: Optional[str] = None
    dispatched: bool = False


class ReplyMonitorRecoveryStartRequest(BaseModel):
    platform_id: UUID
    event_ids: list[UUID] = Field(min_length=1, max_length=100)


class ReplyMonitorRecoveryCandidateDecision(BaseModel):
    decision: Literal["confirm", "reject"]
