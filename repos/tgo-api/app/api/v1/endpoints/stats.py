"""Stats endpoints for the monitoring dashboard (监控面板).

All endpoints require JWT auth; project_id always comes from the current user
(multi-tenant isolation, consistent with the rest of tgo-api).
Read-only aggregation with a 60s Redis cache — stats are never real-time
critical, the cache just protects against panel polling spikes.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.logging import get_logger
from app.core.security import get_current_active_user
from app.models import Staff
from app.schemas.stats import (
    HandoffListResponse,
    OverviewResponse,
    StaffStatsResponse,
    TrendsResponse,
)
from app.services import stats_service

logger = get_logger("endpoints.stats")
router = APIRouter()

DEFAULT_RANGE_DAYS = 7
MAX_RANGE_DAYS = 366


def _resolve_period(start: Optional[datetime], end: Optional[datetime]) -> tuple[datetime, datetime]:
    """校验/补齐时间范围：默认近 7 天，跨度上限 366 天。"""
    now = datetime.utcnow()
    if end is None:
        end = now
    if start is None:
        start = end - timedelta(days=DEFAULT_RANGE_DAYS)
    if start >= end:
        raise ValueError("start must be earlier than end")
    if (end - start) > timedelta(days=MAX_RANGE_DAYS):
        raise ValueError(f"range too large (max {MAX_RANGE_DAYS} days)")
    return start, end


def _require_period(
    start: Optional[datetime] = Query(None, description="起始时间 ISO8601，默认近7天"),
    end: Optional[datetime] = Query(None, description="结束时间 ISO8601，默认当前"),
) -> tuple[datetime, datetime]:
    try:
        return _resolve_period(start, end)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("/overview", response_model=OverviewResponse, summary="监控面板概览（KPI 卡数据）")
async def get_overview(
    period: tuple[datetime, datetime] = Depends(_require_period),
    platform_id: Optional[UUID] = Query(None, description="按平台过滤"),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    start, end = period
    cache_key = stats_service.build_cache_key(
        current_user.project_id, "overview", start=start, end=end, platform_id=platform_id
    )
    cached = await stats_service.get_cached_stats(cache_key)
    if cached is not None:
        return cached

    data = stats_service.get_overview(db, current_user.project_id, start, end, platform_id)
    await stats_service.set_cached_stats(cache_key, data)
    return data


@router.get("/trends", response_model=TrendsResponse, summary="时间趋势（会话/消息/转人工）")
async def get_trends(
    period: tuple[datetime, datetime] = Depends(_require_period),
    granularity: str = Query("day", pattern="^(day|hour)$", description="分桶粒度"),
    platform_id: Optional[UUID] = Query(None, description="按平台过滤"),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    start, end = period
    cache_key = stats_service.build_cache_key(
        current_user.project_id, "trends", start=start, end=end, granularity=granularity, platform_id=platform_id
    )
    cached = await stats_service.get_cached_stats(cache_key)
    if cached is not None:
        return cached

    data = stats_service.get_trends(db, current_user.project_id, start, end, granularity, platform_id)
    await stats_service.set_cached_stats(cache_key, data)
    return data


@router.get("/staff", response_model=StaffStatsResponse, summary="客服负载")
async def get_staff_stats(
    period: tuple[datetime, datetime] = Depends(_require_period),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    start, end = period
    cache_key = stats_service.build_cache_key(current_user.project_id, "staff", start=start, end=end)
    cached = await stats_service.get_cached_stats(cache_key)
    if cached is not None:
        return cached

    data = stats_service.get_staff_stats(db, current_user.project_id, start, end)
    await stats_service.set_cached_stats(cache_key, data)
    return data


@router.get("/handoffs", response_model=HandoffListResponse, summary="转人工明细")
async def get_handoffs(
    period: tuple[datetime, datetime] = Depends(_require_period),
    platform_id: Optional[UUID] = Query(None, description="按平台过滤"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页条数"),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> dict:
    start, end = period
    # 明细不做缓存（含分页，且数据量小；保持最新）
    return stats_service.get_handoff_list(
        db, current_user.project_id, start, end, platform_id, page, page_size
    )
