"""Pydantic response schemas for the stats (monitoring dashboard) endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Overview (KPI cards)
# ---------------------------------------------------------------------------

class StatsPeriod(BaseModel):
    start: datetime
    end: datetime


class SessionsStats(BaseModel):
    total: int = Field(0, description="周期内新开会话总数")
    open: int = Field(0, description="当前进行中会话数")
    closed: int = Field(0, description="周期内已关闭会话数")


class MessagesStats(BaseModel):
    total: int = Field(0)
    visitor: int = Field(0, description="访客消息数")
    ai: int = Field(0, description="AI 回复消息数")
    staff: int = Field(0, description="客服消息数")


class AnsweredStats(BaseModel):
    ai_reply_count: int = Field(0, description="AI 回复消息总数（回答问题总数）")
    ai_session_count: int = Field(0, description="AI 服务过的会话数（ai_message_count>0）")


class HandoffStats(BaseModel):
    count: int = Field(0, description="转人工会话数（事件级，source in llm/transfer）")
    rate: float = Field(0.0, description="转人工率 = count / ai_session_count，0-1")


class VisitorsStats(BaseModel):
    uv: int = Field(0, description="活跃访客数（周期内发言的独立访客）")


class AIUsageStats(BaseModel):
    request_count: int = Field(0, description="AI 请求总数")
    success_rate: float = Field(0.0, description="成功率 0-1")
    failure_count: int = Field(0)
    avg_response_ms: Optional[int] = Field(None, description="平均响应耗时 ms")


class OverviewResponse(BaseModel):
    period: StatsPeriod
    sessions: SessionsStats
    messages: MessagesStats
    answered: AnsweredStats
    handoff: HandoffStats
    visitors: VisitorsStats
    ai: AIUsageStats


# ---------------------------------------------------------------------------
# Trends
# ---------------------------------------------------------------------------

class TrendsResponse(BaseModel):
    granularity: str  # day | hour
    buckets: list[datetime] = Field(default_factory=list, description="连续时间桶，缺桶补 0")
    sessions: list[int] = Field(default_factory=list)
    messages: dict[str, list[int]] = Field(default_factory=lambda: {"visitor": [], "ai": [], "staff": []})
    handoffs: list[int] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Staff load
# ---------------------------------------------------------------------------

class StaffStatItem(BaseModel):
    staff_id: UUID
    staff_name: str
    session_count: int = Field(0, description="处理会话数（作为 assigned_staff 的 distinct 会话）")
    reply_count: int = Field(0, description="客服回复消息总数")
    handoff_handled: int = Field(0, description="客服主动接管（source=manual）次数")


class StaffStatsResponse(BaseModel):
    items: list[StaffStatItem] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Handoff detail list
# ---------------------------------------------------------------------------

class HandoffItem(BaseModel):
    id: UUID
    happened_at: datetime
    visitor_name: str
    reason: Optional[str] = None
    staff_name: Optional[str] = None
    channel: Optional[str] = None
    status: str = Field(..., description="assigned / waiting")


class HandoffListResponse(BaseModel):
    total: int
    items: list[HandoffItem] = Field(default_factory=list)
