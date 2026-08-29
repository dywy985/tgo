"""Stats aggregation service for the monitoring dashboard.

All metrics are aggregated from existing tables — no new tables, no client-side
instrumentation. Everything runs server-side against the shared PostgreSQL
database (tgo-api / tgo-ai / tgo-platform all share the same DB).

Decided metric definitions (see 统计面板UI与后端详细设计.md v1.0):
- 回答问题总数     = SUM(visitor_sessions.ai_message_count)  (会话按 created_at 归属周期)
- 转人工数         = assignment_history source IN (llm, transfer) 的 distinct session_id
- 转人工率         = 转人工会话数 / AI 服务过的会话数 (ai_message_count > 0)
- 满意度           = 本期不做
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models import (
    AgentUsageRecord,
    AssignmentSource,
    Platform,
    SessionStatus,
    Staff,
    VisitorAssignmentHistory,
    VisitorSession,
    VisitorWaitingQueue,
    WaitingStatus,
)

logger = logging.getLogger("services.stats")

# 转人工事件来源（AI 发起 + 客服转接）；客服手动接管 manual 不计入"转人工数"
HANDOFF_SOURCES = (
    AssignmentSource.LLM.value,
    AssignmentSource.TRANSFER.value,
)

CACHE_TTL_SECONDS = 60
CACHE_KEY_PREFIX = "tgo:stats:"

_redis_client = None  # 懒加载单例（复用 run_registry 的 redis.asyncio 模式）


# ---------------------------------------------------------------------------
# Redis 缓存（可选：settings.REDIS_URL 未配置则跳过，直接查库）
# ---------------------------------------------------------------------------

async def _get_redis():
    global _redis_client
    if not settings.REDIS_URL:
        return None
    if _redis_client is None:
        import redis.asyncio as aioredis

        _redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


async def get_cached_stats(key: str) -> Optional[dict]:
    redis = await _get_redis()
    if redis is None:
        return None
    try:
        raw = await redis.get(f"{CACHE_KEY_PREFIX}{key}")
        return json.loads(raw) if raw else None
    except Exception as exc:  # 缓存故障不阻断主流程
        logger.warning("stats cache read failed: %s", exc)
        return None


async def set_cached_stats(key: str, value: dict, ttl: int = CACHE_TTL_SECONDS) -> None:
    redis = await _get_redis()
    if redis is None:
        return
    try:
        await redis.setex(f"{CACHE_KEY_PREFIX}{key}", ttl, json.dumps(value, default=str))
    except Exception as exc:
        logger.warning("stats cache write failed: %s", exc)


def build_cache_key(project_id: UUID, endpoint: str, **params: Any) -> str:
    """确定性缓存 key：project_id + endpoint + 规范化参数哈希。"""
    raw = f"{project_id}:{endpoint}:" + json.dumps(params, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# 工具
# ---------------------------------------------------------------------------

def _display_name(obj: Any, fallback: str = "--") -> str:
    """取展示名：name or nickname or username/标识，兼容各模型。"""
    if obj is None:
        return fallback
    for attr in ("name", "nickname", "username", "platform_open_id"):
        val = getattr(obj, attr, None)
        if val:
            return str(val)
    return fallback


def _visitor_display_name(visitor: Any) -> str:
    name = _display_name(visitor, "")
    if len(name) > 12:
        name = name[:12] + "…"
    return name or "--"


def _make_buckets(start: datetime, end: datetime, granularity: str) -> list[datetime]:
    """生成连续时间桶（start 对齐到桶边界），缺桶补 0 用。上限 2000 防死循环。"""
    buckets: list[datetime] = []
    if granularity == "hour":
        cur = start.replace(minute=0, second=0, microsecond=0)
        step = timedelta(hours=1)
    else:
        cur = start.replace(hour=0, minute=0, second=0, microsecond=0)
        step = timedelta(days=1)
    while cur < end and len(buckets) < 2000:
        buckets.append(cur)
        cur += step
    return buckets


def _apply_platform_filter(query, model, platform_id: Optional[UUID]):
    if platform_id:
        return query.filter(model.platform_id == platform_id)
    return query


# ---------------------------------------------------------------------------
# Overview（KPI 卡，一次取齐）
# ---------------------------------------------------------------------------

def get_overview(
    db: Session,
    project_id: UUID,
    start: datetime,
    end: datetime,
    platform_id: Optional[UUID] = None,
) -> dict:
    # 1) 会话 / 消息三分量 / UV / AI 服务会话数 —— 单条聚合 SQL
    # AI 服务会话 = ai_message_count>0 或 发生过 AI/系统转人工 (llm/transfer)
    # (转人工关键词命中的会话可能没有 ai_message_count, 但 AI 判定转人工 = AI 参与过)
    ai_session_exists = (
        db.query(VisitorAssignmentHistory.id)
        .filter(
            VisitorAssignmentHistory.session_id == VisitorSession.id,
            VisitorAssignmentHistory.project_id == project_id,
            VisitorAssignmentHistory.source.in_(HANDOFF_SOURCES),
        )
        .exists()
    )
    q = db.query(
        func.count(VisitorSession.id),
        func.count(VisitorSession.id).filter(VisitorSession.status == SessionStatus.OPEN.value),
        func.coalesce(func.sum(VisitorSession.visitor_message_count), 0),
        func.coalesce(func.sum(VisitorSession.ai_message_count), 0),
        func.coalesce(func.sum(VisitorSession.staff_message_count), 0),
        func.count(func.distinct(VisitorSession.visitor_id)),
        func.count(VisitorSession.id).filter(
            (VisitorSession.ai_message_count > 0) | ai_session_exists
        ),
    ).filter(
        VisitorSession.project_id == project_id,
        VisitorSession.created_at >= start,
        VisitorSession.created_at < end,
    )
    q = _apply_platform_filter(q, VisitorSession, platform_id)
    total, open_count, vm, am, sm, uv, ai_sessions = q.one()

    # 2) 转人工数（按"会话创建时间"归属周期, 与分母 ai_session_count 口径一致,
    #    避免 会话昨天创建+今天转人工 导致 分子>分母 出现 >100%）
    hq = db.query(func.count(func.distinct(VisitorAssignmentHistory.session_id))).join(
        VisitorSession, VisitorAssignmentHistory.session_id == VisitorSession.id
    ).filter(
        VisitorAssignmentHistory.project_id == project_id,
        VisitorAssignmentHistory.source.in_(HANDOFF_SOURCES),
        VisitorSession.created_at >= start,
        VisitorSession.created_at < end,
        VisitorAssignmentHistory.session_id.isnot(None),
    )
    if platform_id:
        hq = hq.filter(VisitorSession.platform_id == platform_id)
    handoff_count = int(hq.scalar() or 0)

    # 3) AI 用量（跨服务表 ai_agent_usage_records，同库直查；容错：表/数据缺失不拖垮面板）
    ai = {
        "request_count": 0, "success_rate": 0.0, "failure_count": 0,
        "avg_response_ms": None, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
    }
    try:
        req, fail, avg, ptok, ctok, ttok = db.query(
            func.coalesce(func.sum(AgentUsageRecord.request_count), 0),
            func.coalesce(func.sum(AgentUsageRecord.failure_count), 0),
            func.avg(AgentUsageRecord.avg_response_time_ms),
            func.coalesce(func.sum(AgentUsageRecord.prompt_tokens), 0),
            func.coalesce(func.sum(AgentUsageRecord.completion_tokens), 0),
            func.coalesce(func.sum(AgentUsageRecord.total_tokens), 0),
        ).filter(
            AgentUsageRecord.project_id == project_id,
            AgentUsageRecord.aggregation_type == "daily",
            AgentUsageRecord.period_start >= start,
            AgentUsageRecord.period_start < end,
        ).one()
        req, fail = int(req or 0), int(fail or 0)
        ai = {
            "request_count": req,
            "failure_count": fail,
            "success_rate": round((req - fail) / req, 4) if req else 0.0,
            "avg_response_ms": int(avg) if avg else None,
            "prompt_tokens": int(ptok or 0),
            "completion_tokens": int(ctok or 0),
            "total_tokens": int(ttok or 0),
        }
    except Exception as exc:
        logger.warning("ai_agent_usage_records unavailable: %s", exc)

    ai_sessions = int(ai_sessions or 0)
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "sessions": {
            "total": int(total or 0),
            "open": int(open_count or 0),
            "closed": max(int(total or 0) - int(open_count or 0), 0),
        },
        "messages": {
            "total": int(vm or 0) + int(am or 0) + int(sm or 0),
            "visitor": int(vm or 0),
            "ai": int(am or 0),
            "staff": int(sm or 0),
        },
        "answered": {
            "ai_reply_count": int(am or 0),
            "ai_session_count": ai_sessions,
        },
        "handoff": {
            "count": handoff_count,
            # 分子分母同口径(会话创建时间), 但仍防御性 cap 到 1.0
            "rate": round(min(handoff_count / ai_sessions, 1.0), 4) if ai_sessions else 0.0,
        },
        "visitors": {"uv": int(uv or 0)},
        "ai": ai,
    }


# ---------------------------------------------------------------------------
# Trends（按 day/hour 分桶）
# ---------------------------------------------------------------------------

def get_trends(
    db: Session,
    project_id: UUID,
    start: datetime,
    end: datetime,
    granularity: str,
    platform_id: Optional[UUID] = None,
) -> dict:
    if granularity not in ("day", "hour"):
        granularity = "day"

    # 会话 + 消息序列
    bucket = func.date_trunc(granularity, VisitorSession.created_at)
    q = db.query(
        bucket.label("bucket"),
        func.count(VisitorSession.id),
        func.coalesce(func.sum(VisitorSession.visitor_message_count), 0),
        func.coalesce(func.sum(VisitorSession.ai_message_count), 0),
        func.coalesce(func.sum(VisitorSession.staff_message_count), 0),
    ).filter(
        VisitorSession.project_id == project_id,
        VisitorSession.created_at >= start,
        VisitorSession.created_at < end,
    )
    q = _apply_platform_filter(q, VisitorSession, platform_id)
    session_rows = q.group_by(bucket).order_by(bucket).all()

    # 转人工序列（按会话创建时间, 与会话/消息序列口径一致）
    hbucket = func.date_trunc(granularity, VisitorSession.created_at)
    hq = db.query(
        hbucket.label("bucket"),
        func.count(func.distinct(VisitorAssignmentHistory.session_id)),
    ).join(
        VisitorSession, VisitorAssignmentHistory.session_id == VisitorSession.id
    ).filter(
        VisitorAssignmentHistory.project_id == project_id,
        VisitorAssignmentHistory.source.in_(HANDOFF_SOURCES),
        VisitorSession.created_at >= start,
        VisitorSession.created_at < end,
        VisitorAssignmentHistory.session_id.isnot(None),
    )
    if platform_id:
        hq = hq.filter(VisitorSession.platform_id == platform_id)
    handoff_rows = hq.group_by(hbucket).order_by(hbucket).all()

    # 补零对齐
    buckets = _make_buckets(start, end, granularity)
    session_map = {r[0].timestamp(): r for r in session_rows}
    handoff_map = {r[0].timestamp(): r[1] for r in handoff_rows}

    sessions: list[int] = []
    messages = {"visitor": [], "ai": [], "staff": []}
    handoffs: list[int] = []
    for b in buckets:
        ts = b.timestamp()
        r = session_map.get(ts)
        sessions.append(int(r[1]) if r else 0)
        messages["visitor"].append(int(r[2]) if r else 0)
        messages["ai"].append(int(r[3]) if r else 0)
        messages["staff"].append(int(r[4]) if r else 0)
        handoffs.append(int(handoff_map.get(ts, 0) or 0))

    return {
        "granularity": granularity,
        "buckets": [b.isoformat() for b in buckets],
        "sessions": sessions,
        "messages": messages,
        "handoffs": handoffs,
    }


# ---------------------------------------------------------------------------
# Staff 负载
# ---------------------------------------------------------------------------

def get_staff_stats(db: Session, project_id: UUID, start: datetime, end: datetime) -> dict:
    # 1) 每客服：处理会话数（distinct session）+ 主动接管数（source=manual）
    assign_rows = db.query(
        VisitorAssignmentHistory.assigned_staff_id,
        func.count(func.distinct(VisitorAssignmentHistory.session_id)),
        func.count(VisitorAssignmentHistory.id).filter(
            VisitorAssignmentHistory.source == AssignmentSource.MANUAL.value
        ),
    ).filter(
        VisitorAssignmentHistory.project_id == project_id,
        VisitorAssignmentHistory.assigned_staff_id.isnot(None),
        VisitorAssignmentHistory.created_at >= start,
        VisitorAssignmentHistory.created_at < end,
    ).group_by(VisitorAssignmentHistory.assigned_staff_id).all()

    # 2) 每客服：回复消息数（按会话归属）
    reply_rows = db.query(
        VisitorSession.staff_id,
        func.coalesce(func.sum(VisitorSession.staff_message_count), 0),
    ).filter(
        VisitorSession.project_id == project_id,
        VisitorSession.staff_id.isnot(None),
        VisitorSession.created_at >= start,
        VisitorSession.created_at < end,
    ).group_by(VisitorSession.staff_id).all()

    staff_ids = {r[0] for r in assign_rows} | {r[0] for r in reply_rows if r[0]}
    staff_map: dict = {}
    if staff_ids:
        for s in db.query(Staff).filter(Staff.id.in_(staff_ids)):
            staff_map[s.id] = _display_name(s)

    items = []
    for staff_id, session_count, manual_count in assign_rows:
        items.append({
            "staff_id": staff_id,
            "staff_name": staff_map.get(staff_id, "--"),
            "session_count": int(session_count or 0),
            "reply_count": 0,
            "handoff_handled": int(manual_count or 0),
        })
    reply_map = {r[0]: int(r[1] or 0) for r in reply_rows}
    for item in items:
        item["reply_count"] = reply_map.get(item["staff_id"], 0)
    # 只分配未回复的兜底（理论上 assign 一定伴随回复）
    existing = {i["staff_id"] for i in items}
    for staff_id, reply_count in reply_map.items():
        if staff_id not in existing:
            items.append({
                "staff_id": staff_id,
                "staff_name": staff_map.get(staff_id, "--"),
                "session_count": 0,
                "reply_count": reply_count,
                "handoff_handled": 0,
            })

    items.sort(key=lambda i: i["session_count"], reverse=True)
    return {"items": items}


# ---------------------------------------------------------------------------
# 转人工明细（已分配 + 排队中）
# ---------------------------------------------------------------------------

def get_handoff_list(
    db: Session,
    project_id: UUID,
    start: datetime,
    end: datetime,
    platform_id: Optional[UUID] = None,
    page: int = 1,
    size: int = 20,
) -> dict:
    # 已分配：assignment_history
    aq = db.query(VisitorAssignmentHistory).filter(
        VisitorAssignmentHistory.project_id == project_id,
        VisitorAssignmentHistory.source.in_(HANDOFF_SOURCES),
        VisitorAssignmentHistory.created_at >= start,
        VisitorAssignmentHistory.created_at < end,
        VisitorAssignmentHistory.session_id.isnot(None),
    )
    if platform_id:
        aq = aq.join(VisitorSession, VisitorAssignmentHistory.session_id == VisitorSession.id).filter(
            VisitorSession.platform_id == platform_id
        )
    aq = aq.options(
        joinedload(VisitorAssignmentHistory.visitor),
        joinedload(VisitorAssignmentHistory.assigned_staff),
    )

    # 排队中：waiting_queue（AI 发起转人工但无客服 → 排队）
    wq = db.query(VisitorWaitingQueue).filter(
        VisitorWaitingQueue.project_id == project_id,
        VisitorWaitingQueue.status == WaitingStatus.WAITING.value,
        VisitorWaitingQueue.entered_at >= start,
        VisitorWaitingQueue.entered_at < end,
        VisitorWaitingQueue.session_id.isnot(None),
    )
    if platform_id:
        wq = wq.join(VisitorSession, VisitorWaitingQueue.session_id == VisitorSession.id).filter(
            VisitorSession.platform_id == platform_id
        )
    wq = wq.options(
        joinedload(VisitorWaitingQueue.visitor),
        joinedload(VisitorWaitingQueue.session),
    )

    # 合并统一排序（数据量小，内存排序分页）
    combined: list[dict] = []
    for h in aq.all():
        combined.append({
            "id": h.id,
            "happened_at": h.created_at,
            "visitor_name": _visitor_display_name(h.visitor),
            "reason": h.notes,
            "staff_name": _display_name(h.assigned_staff) if h.assigned_staff else None,
            "channel": None,  # 平台名在下方统一解析
            "platform_id": h.session.platform_id if h.session else None,
            "status": "assigned",
        })
    for w in wq.all():
        combined.append({
            "id": w.id,
            "happened_at": w.entered_at,
            "visitor_name": _visitor_display_name(w.visitor),
            "reason": w.reason,
            "staff_name": None,
            "channel": None,
            "platform_id": w.session.platform_id if w.session else None,
            "status": "waiting",
        })

    combined.sort(key=lambda i: i["happened_at"], reverse=True)
    total = len(combined)

    # 平台名解析
    platform_ids = {i["platform_id"] for i in combined if i["platform_id"]}
    platform_names: dict = {}
    if platform_ids:
        for p in db.query(Platform).filter(Platform.id.in_(platform_ids)):
            platform_names[p.id] = p.name or p.type
    for item in combined:
        item["channel"] = platform_names.get(item["platform_id"]) if item["platform_id"] else None
        item.pop("platform_id", None)

    start_idx = (page - 1) * size
    items = combined[start_idx : start_idx + size]
    return {"total": total, "items": items}
