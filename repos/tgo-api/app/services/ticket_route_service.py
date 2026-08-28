"""Ticket route resolution: 访客/群 → 指定客服（负责范围路由）。

匹配维度（api_ticket_routes）：
  - visitor_key: 特定客户 external_userid（最精确）
  - group_key:   群 chatid
  - platform_id: 渠道平台
  - 空值 = 通配

匹配优先级（分数 + priority）：
  visitor_key 匹配 +4 > group_key 匹配 +2 > platform_id 匹配 +2
  同级多条按 priority 降序取第一条。

用途：
  1) 转人工分配：命中路由且客服可服务 → 直接分配该客服（跳过 LLM/负载均衡）
  2) 工单归属/提醒：_notify_staff_new_ticket 的目标客服
  3) 同群降级：路由客服不可服务时，尝试同群其他路由客服（scope_degrade）
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models import TicketRoute

logger = get_logger("services.ticket_route")


def _match_score(
    route: TicketRoute,
    platform_id: Optional[UUID],
    group_key: Optional[str],
    visitor_key: Optional[str],
) -> int:
    """计算路由与上下文的匹配分。空值通配不加分；值精确匹配加分。"""
    score = 0
    if visitor_key and route.visitor_key and route.visitor_key == visitor_key:
        score += 4
    if group_key and route.group_key and route.group_key == group_key:
        score += 2
    if platform_id and route.platform_id and route.platform_id == platform_id:
        score += 2
    return score


def resolve_ticket_route(
    db: Session,
    *,
    project_id: UUID,
    platform_id: Optional[UUID] = None,
    group_key: Optional[str] = None,
    visitor_key: Optional[str] = None,
) -> Optional[TicketRoute]:
    """解析最匹配的路由。

    精度降序：visitor_key > group_key > platform 级 > 项目兜底（全空）。
    同级按 priority 降序。只返回带 staff_id 的有效路由。
    """
    routes = (
        db.query(TicketRoute)
        .filter(
            TicketRoute.project_id == project_id,
            TicketRoute.deleted_at.is_(None),
            TicketRoute.staff_id.isnot(None),
        )
        .all()
    )
    if not routes:
        return None

    best: Optional[TicketRoute] = None
    best_score = -1
    for route in routes:
        score = _match_score(route, platform_id, group_key, visitor_key)
        if score > best_score or (score == best_score and best is not None and route.priority > best.priority):
            best = route
            best_score = score
    # score>0 才算命中：0 分 = 无任何维度精确匹配（全是通配），不得当作匹配
    return best if best_score > 0 else None


def resolve_scope_degrade_candidates(
    db: Session,
    *,
    project_id: UUID,
    platform_id: Optional[UUID],
    group_key: Optional[str],
    exclude_staff_id: UUID,
) -> list[TicketRoute]:
    """同群降级候选：同 platform + 同 group_key 的其他路由客服，按 priority 降序。

    仅当 group_key 非空（群场景）时有意义；单客户路由（visitor_key）不降级。
    """
    if not group_key:
        return []
    routes = (
        db.query(TicketRoute)
        .filter(
            TicketRoute.project_id == project_id,
            TicketRoute.deleted_at.is_(None),
            TicketRoute.staff_id.isnot(None),
            TicketRoute.staff_id != exclude_staff_id,
            TicketRoute.group_key == group_key,
        )
        .order_by(TicketRoute.priority.desc())
        .all()
    )
    if platform_id:
        # 优先同 platform 的路由；无则退回同群任意平台
        same_platform = [r for r in routes if r.platform_id == platform_id]
        return same_platform or routes
    return routes
