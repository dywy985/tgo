"""客服上线/恢复服务时的未完成工单提醒（站内 + 企微应用消息双通道）。

触发点（见 staff.py）：
  - 上线：PUT /me/service-active (is_active=true)
  - 恢复服务：PUT /me/service-paused (service_paused=false)
  - 登录：POST /login

防骚扰：只在上述动作时触发一次；无未完成工单时静默。
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.core.logging import get_logger
from app.models import Staff, Ticket

logger = get_logger("services.staff_notification")

# 未完成工单状态集
_UNFINISHED_STATUSES = ("pending_reply",)


def get_unfinished_tickets(db: Session, staff_id, project_id) -> list[Ticket]:
    """查某客服未完成工单（按 SLA 到期时间升序，临期优先）。"""
    return (
        db.query(Ticket)
        .filter(
            Ticket.assignee_id == staff_id,
            Ticket.project_id == project_id,
            Ticket.status.in_(_UNFINISHED_STATUSES),
            Ticket.deleted_at.is_(None),
        )
        .order_by(Ticket.sla_due_at.asc().nulls_last(), Ticket.created_at.asc())
        .all()
    )


def _build_ticket_summary(tickets: list[Ticket], max_items: int = 8) -> str:
    """生成工单摘要文本（编号/标题/优先级/SLA）。"""
    lines = []
    for t in tickets[:max_items]:
        prio = {"low": "低", "normal": "普通", "high": "高", "urgent": "紧急"}.get(t.priority, t.priority)
        sla = f" SLA:{t.sla_due_at:%m-%d %H:%M}" if t.sla_due_at else ""
        title = (t.title or "")[:24]
        lines.append(f"  {t.number} [{prio}] {title}{sla}")
    if len(tickets) > max_items:
        lines.append(f"  … 等共 {len(tickets)} 条")
    return "\n".join(lines)


async def notify_unfinished_tickets(db: Session, staff: Staff) -> None:
    """客服上线/恢复时推送未完成工单提醒。best-effort，失败不抛异常。"""
    try:
        tickets = get_unfinished_tickets(db, staff.id, staff.project_id)
        if not tickets:
            return
        summary = _build_ticket_summary(tickets)
        content = (
            f"【未完成工单提醒】您有 {len(tickets)} 个待处理工单：\n"
            f"{summary}\n"
            f"请及时处理（工单页可按「我的」筛选）"
        )

        # 1) 站内：WuKongIM 单聊发给该客服
        sent_in_app = False
        try:
            from app.services.wukongim_client import wukongim_client

            await wukongim_client.send_text_message(
                from_uid=f"{staff.id}-staff",
                channel_id=f"{staff.id}-staff",
                channel_type=1,  # 单聊
                content=content,
            )
            sent_in_app = True
        except Exception as e:  # noqa: BLE001
            logger.warning("[NOTIFY] 站内提醒失败 (staff=%s): %s", staff.id, e)

        # 2) 企微应用消息（staff.wecom_userid 配置了才推）
        if staff.wecom_userid:
            try:
                from app.services.wecom_app_client import find_wecom_platform, send_wecom_app_message

                platform = find_wecom_platform(db, staff.project_id)
                if platform:
                    await send_wecom_app_message(platform, staff.wecom_userid, content)
            except Exception as e:  # noqa: BLE001
                logger.warning("[NOTIFY] 企微提醒失败 (staff=%s): %s", staff.id, e)

        logger.info(
            "[NOTIFY] 未完成工单提醒: staff=%s tickets=%d in_app=%s",
            staff.id, len(tickets), sent_in_app,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("[NOTIFY] 未完成工单提醒异常: %s", e)
