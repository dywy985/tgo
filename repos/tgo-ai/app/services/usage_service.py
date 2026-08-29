"""Agent usage recording service (tgo-ai).

把每次 LLM 请求的计数与 token 消耗按天聚合写入 `ai_agent_usage_records`,
供 tgo-api 统计面板 (AI 运行状况) 读取。

设计:
- 聚合粒度: 每 (project_id, agent_id, 自然日) 一行, aggregation_type='daily'
- 幂等: upsert 语义, 重复上报同一请求由调用方保证 (调用方只在请求完成后上报一次)
- 并发安全: 用 SQL UPDATE ... SET col = col + N 原子累加
- 失败不抛异常: 统计为辅助功能, 记录失败不应影响主聊天流程
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.usage import AgentUsageRecord

logger = logging.getLogger("services.usage")


def _period_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """自然日 [00:00, 24:00) 边界 (UTC)。"""
    now = now or datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start.replace(day=start.day + 1)
    return start, end


async def record_usage(
    db: AsyncSession,
    *,
    project_id: UUID,
    agent_id: UUID | None,
    usage,
    response_time_ms: int | None = None,
    success: bool = True,
) -> None:
    """记录一次 LLM 请求的计数与 token 消耗 (按天聚合 upsert)。

    Args:
        db: tgo-ai 的 AsyncSession
        project_id: 项目 ID
        agent_id: Agent ID (可能为 None, 走平台默认 agent 时无显式 agent_id)
        usage: chat_service 累积的 Usage 对象 (prompt/completion/total tokens)
        response_time_ms: 本次请求耗时 (可选)
        success: 请求是否成功 (默认 True)
    """
    if agent_id is None:
        # 无 agent_id 时无法按 agent 聚合, 跳过 (stats 面板按 project 汇总,
        # 但表结构以 agent_id 为粒度; 有 agent_id 的请求是主流)
        logger.debug("record_usage: agent_id is None, skip")
        return

    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    total_tokens = int(getattr(usage, "total_tokens", 0) or 0)

    period_start, period_end = _period_bounds()

    stmt = pg_insert(AgentUsageRecord).values(
        project_id=project_id,
        agent_id=agent_id,
        request_count=1,
        success_count=1 if success else 0,
        failure_count=0 if success else 1,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        avg_response_time_ms=response_time_ms,
        last_request_time=datetime.now(timezone.utc),
        period_start=period_start,
        period_end=period_end,
        aggregation_type="daily",
    )

    # 冲突 (同 project+agent+天) 时原子累加; avg_response_time 取最新值 (简化, 避免复杂表达式编译问题)
    stmt = stmt.on_conflict_do_update(
        constraint="ai_agent_usage_records_project_agent_period_key",
        set_={
            "request_count": AgentUsageRecord.request_count + 1,
            "success_count": AgentUsageRecord.success_count + (1 if success else 0),
            "failure_count": AgentUsageRecord.failure_count + (0 if success else 1),
            "prompt_tokens": AgentUsageRecord.prompt_tokens + prompt_tokens,
            "completion_tokens": AgentUsageRecord.completion_tokens + completion_tokens,
            "total_tokens": AgentUsageRecord.total_tokens + total_tokens,
            "avg_response_time_ms": response_time_ms if response_time_ms else AgentUsageRecord.avg_response_time_ms,
            "last_request_time": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        },
    )

    try:
        await db.execute(stmt)
        await db.commit()
    except Exception as exc:
        # 统计失败不阻塞主流程
        try:
            await db.rollback()
        except Exception:
            pass
        logger.warning("record_usage failed (non-fatal): %s", exc)
