"""统一消息计数服务 (message_stats_service).

方案B：为 tgo-api 提供**唯一**的消息计数入口，把 VisitorSession 的
visitor_message_count / ai_message_count / staff_message_count 三字段的
累加集中在这里，供统计面板 (stats_service) 使用。

背景:
- 原代码里这三个计数字段只被 stats_service 读取、从未被累加，
  导致 "回答问题总数 / 转人工率 / 消息数" 恒为 0 或不准确。
- 普通 AI 自动回复的对话原先不创建 VisitorSession (只在转人工时建)，
  导致 AI 服务会话数 / 会话总数漏记。
- 本服务统一解决: 每次消息落库时确保会话存在并原子累加对应计数。

并发安全:
- 累加采用 SQL UPDATE ... SET col = col + N (而非 read-modify-write)，
  避免并发消息丢失计数。
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import func, update
from sqlalchemy.orm import Session

from app.models import SessionStatus, VisitorSession

logger = logging.getLogger("services.message_stats")


# ---------------------------------------------------------------------------
# 会话查找 / 创建
# ---------------------------------------------------------------------------

def ensure_open_session(
    db: Session,
    *,
    visitor_id: UUID,
    project_id: UUID,
    platform_id: Optional[UUID] = None,
    session_id: Optional[UUID] = None,
) -> VisitorSession:
    """获取当前访客的 open 会话，不存在则创建一条。

    与 transfer_service._get_or_create_session 语义一致，但独立维护，
    避免消息计数路径与转人工路径耦合。
    - 若显式传入 session_id 且存在，返回之；
    - 否则取该访客最近一条 open 会话；
    - 仍无则新建 open 会话 (仅 flush，不 commit，由调用方决定提交时机)。
    """
    if session_id is not None:
        session = (
            db.query(VisitorSession)
            .filter(
                VisitorSession.id == session_id,
                VisitorSession.project_id == project_id,
            )
            .first()
        )
        if session is not None:
            return session

    session = (
        db.query(VisitorSession)
        .filter(
            VisitorSession.visitor_id == visitor_id,
            VisitorSession.project_id == project_id,
            VisitorSession.status == SessionStatus.OPEN.value,
        )
        .order_by(VisitorSession.created_at.desc())
        .first()
    )
    if session is not None:
        return session

    session = VisitorSession(
        project_id=project_id,
        visitor_id=visitor_id,
        platform_id=platform_id,
        status=SessionStatus.OPEN.value,
    )
    db.add(session)
    db.flush()
    logger.info("message_stats: created open session %s for visitor %s", session.id, visitor_id)
    return session


# ---------------------------------------------------------------------------
# 消息计数累加 (原子)
# ---------------------------------------------------------------------------

_COUNT_COLUMNS = {
    "visitor": "visitor_message_count",
    "ai": "ai_message_count",
    "staff": "staff_message_count",
}


def record_message(
    db: Session,
    *,
    session_id: UUID,
    kind: str,
    count: int = 1,
) -> None:
    """原子累加某会话的消息计数。

    Args:
        db: 数据库会话
        session_id: 目标 VisitorSession id
        kind: 'visitor' | 'ai' | 'staff'
        count: 累加数量 (默认 1)

    通过 SQL UPDATE col = col + N 原子执行，并同步累加 message_count
    与 last_message_at，避免并发下 read-modify-write 丢计数。
    """
    column = _COUNT_COLUMNS.get(kind)
    if column is None:
        raise ValueError(f"unknown message kind: {kind!r} (expected visitor|ai|staff)")

    db.execute(
        update(VisitorSession)
        .where(
            VisitorSession.id == session_id,
            VisitorSession.status == SessionStatus.OPEN.value,
        )
        .values(
            message_count=VisitorSession.message_count + count,
            **{column: func.coalesce(getattr(VisitorSession, column), 0) + count},
            last_message_at=func.now(),
        )
    )
