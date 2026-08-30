"""Scheduled task for automatic AI fallback in assist mode."""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import SessionLocal
from app.models import Platform, Visitor, VisitorServiceStatus, VisitorSession, SessionStatus
from app.services.chat_service import handle_ai_response_non_stream
from app.services.wukongim_client import wukongim_client
from app.utils.encoding import build_visitor_channel_id, get_session_id
from app.utils.const import CHANNEL_TYPE_CUSTOMER_SERVICE

logger = logging.getLogger(__name__)

_auto_fallback_task: Optional[asyncio.Task] = None

# Constants for retry logic
MAX_AI_FALLBACK_RETRIES = 3

# 转人工后人工超时未响应 → 自动恢复 AI 的等待分钟数
# (platform.fallback_to_ai_timeout > 0 时优先用该配置, 0/空用此默认)
MANUAL_SERVICE_FALLBACK_MINUTES = 30

async def start_auto_fallback_to_ai_task(interval_seconds: int = 60):
    """Start the periodic auto fallback check task."""
    global _auto_fallback_task
    if _auto_fallback_task is not None:
        return

    async def _loop():
        while True:
            try:
                await check_and_fallback_to_ai()
            except Exception as e:
                logger.error(f"Error in auto_fallback_to_ai loop: {e}")
            await asyncio.sleep(interval_seconds)

    _auto_fallback_task = asyncio.create_task(_loop())
    logger.info("Started auto fallback to AI periodic task")

async def stop_auto_fallback_to_ai_task():
    """Stop the periodic auto fallback check task."""
    global _auto_fallback_task
    if _auto_fallback_task:
        _auto_fallback_task.cancel()
        try:
            await _auto_fallback_task
        except asyncio.CancelledError:
            pass
        _auto_fallback_task = None
        logger.info("Stopped auto fallback to AI periodic task")

async def _fallback_manual_service_timeouts(db: Session) -> None:
    """转人工后人工超时未响应 → 自动恢复 AI 继续服务。

    判定条件（全部满足才回落）:
      - visitor.ai_disabled = true (已被转人工关闭 AI)
      - 存在 open 会话, 且人工从未回复 (staff_message_count = 0)
      - 会话最后活动超过超时时间 (platform.fallback_to_ai_timeout>0 优先, 默认 30 分钟)

    恢复动作: ai_disabled=false + service_status 重置为 NEW (可再次转人工) + 站内提示
    """
    from app.models import VisitorServiceStatus, VisitorSession, SessionStatus

    try:
        visitors = db.query(Visitor).filter(
            Visitor.ai_disabled.is_(True),
            Visitor.deleted_at.is_(None),
        ).all()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"[FALLBACK] 查询转人工超时 visitor 失败: {e}")
        return

    now = datetime.utcnow()
    for v in visitors:
        try:
            session = (
                db.query(VisitorSession)
                .filter(
                    VisitorSession.visitor_id == v.id,
                    VisitorSession.status == SessionStatus.OPEN.value,
                )
                .order_by(VisitorSession.created_at.desc())
                .first()
            )
            if not session:
                # 无 open 会话(人工已关闭/超时关闭) → 直接恢复 AI
                pass
            else:
                # 人工回复过 → 人工正在处理, 不回落
                if (session.staff_message_count or 0) > 0:
                    continue
                last_act = session.last_message_at or session.updated_at
                if not last_act:
                    continue
                platform = None
                if v.platform_id:
                    platform = db.query(Platform).filter(Platform.id == v.platform_id).first()
                timeout_min = (platform.fallback_to_ai_timeout or 0) if platform else 0
                if timeout_min <= 0:
                    timeout_min = MANUAL_SERVICE_FALLBACK_MINUTES
                if (now - last_act).total_seconds() < timeout_min * 60:
                    continue

            # 恢复 AI 服务
            v.ai_disabled = False
            v.ai_fallback_retry_count = 0
            v.service_status = VisitorServiceStatus.NEW.value
            db.add(v)
            db.commit()
            logger.info(
                f"[FALLBACK] 转人工超时回落: visitor={v.id} (人工超时未回复), AI 已恢复"
            )
            # 站内提示 (best-effort)
            try:
                channel_id = build_visitor_channel_id(v.id)
                await wukongim_client.send_text_message(
                    from_uid=f"{session.staff_id}-staff" if (session and session.staff_id) else "system",
                    channel_id=channel_id,
                    channel_type=CHANNEL_TYPE_CUSTOMER_SERVICE,
                    content="人工坐席超时未响应，已自动恢复 AI 继续为您服务。",
                )
            except Exception:  # noqa: BLE001
                pass
        except Exception as e:  # noqa: BLE001
            logger.warning(f"[FALLBACK] 处理 visitor {v.id} 回落失败: {e}")
            db.rollback()


async def check_and_fallback_to_ai():
    """
    Scheduled task to check for visitors waiting too long in 'assist' mode platforms
    and trigger AI fallback.
    """
    db: Session = SessionLocal()
    try:
        # 0) 转人工超时回落: manual_service 转人工后人工 N 分钟未回复 → 恢复 AI
        #    (不限 assist 模式; auto 模式平台转人工后同样适用)
        await _fallback_manual_service_timeouts(db)

        # 1) Get platforms in assist mode with timeout > 0
        platforms = db.query(Platform).filter(
            Platform.ai_mode == "assist",
            Platform.fallback_to_ai_timeout > 0,
            Platform.is_active.is_(True),
            Platform.deleted_at.is_(None)
        ).all()

        if not platforms:
            return

        for platform in platforms:
            timeout_seconds = platform.fallback_to_ai_timeout
            cutoff_time = datetime.utcnow() - timedelta(seconds=timeout_seconds)

            # 2) Find visitors who:
            # - belong to this platform
            # - are NOT closed
            # - last message was from visitor
            # - last message was sent before cutoff_time
            # - have a valid last_client_msg_no to query
            # - have not exceeded the max retry count
            # - ai_disabled is not True
            visitors = db.query(Visitor).filter(
                Visitor.platform_id == platform.id,
                Visitor.service_status == VisitorServiceStatus.ACTIVE.value,
                Visitor.is_last_message_from_visitor.is_(True),
                Visitor.last_message_at < cutoff_time,
                Visitor.last_client_msg_no.isnot(None),
                Visitor.ai_fallback_retry_count < MAX_AI_FALLBACK_RETRIES,
                Visitor.deleted_at.is_(None),
                or_(Visitor.ai_disabled.is_(None), Visitor.ai_disabled.is_(False))
            ).all()

            for visitor in visitors:
                logger.info(f"Triggering AI fallback for visitor {visitor.id} on platform {platform.name}")
                
                # 3) Retrieve last message from WuKongIM via /message API using client_msg_no
                channel_id = build_visitor_channel_id(visitor.id)
                channel_type = CHANNEL_TYPE_CUSTOMER_SERVICE
                
                try:
                    # Query message by client_msg_no
                    last_msg = await wukongim_client.get_message_by_client_msg_no(
                        channel_id=channel_id,
                        channel_type=channel_type,
                        client_msg_no=visitor.last_client_msg_no
                    )
                    
                    if not last_msg:
                        logger.warning(f"No message found for visitor {visitor.id} with client_msg_no {visitor.last_client_msg_no}")
                        # If message not found, it's a permanent error for this message, stop retrying
                        visitor.ai_fallback_retry_count = MAX_AI_FALLBACK_RETRIES
                        db.add(visitor)
                        db.commit()
                        continue
                    
                    message_content = ""
                    if last_msg.payload:
                        message_content = last_msg.payload.get("content", "")
                    
                    if not message_content:
                        logger.warning(f"Last message for visitor {visitor.id} has no content or not a text message")
                        # If message content empty, stop retrying
                        visitor.ai_fallback_retry_count = MAX_AI_FALLBACK_RETRIES
                        db.add(visitor)
                        db.commit()
                        continue

                    # 4) Prepare for AI interaction (Identify from_uid)
                    response_client_msg_no = f"ai_fallback_{uuid4().hex}"
                    
                    # Check for an active session to get assigned staff
                    session = db.query(VisitorSession).filter(
                        VisitorSession.visitor_id == visitor.id,
                        VisitorSession.status == SessionStatus.OPEN.value,
                        VisitorSession.staff_id.isnot(None)
                    ).first()
                    
                    if session and session.staff_id:
                        from_uid = f"{session.staff_id}-staff"
                    else:
                        # Fallback to AI UID if no staff assigned yet
                        logger.debug(f"No staff assigned to visitor {visitor.id}, using fallback AI UID")
                        visitor.ai_fallback_retry_count = MAX_AI_FALLBACK_RETRIES
                        db.add(visitor)
                        db.commit()
                        continue

                    # 5) Call AI synchronously and wait for result
                    agent_runtime_kwargs: dict[str, str] = {}
                    if platform.agent_id is not None:
                        agent_runtime_kwargs["agent_id"] = str(platform.agent_id)
                    
                    try:
                        # Call AI and wait for completion (not background task)
                        ai_result = await handle_ai_response_non_stream(
                            project_id=str(platform.project_id),
                            visitor_id=str(visitor.id),
                            message=message_content,
                            channel_id=channel_id,
                            channel_type=channel_type,
                            client_msg_no=response_client_msg_no,
                            from_uid=from_uid,
                            session_id=get_session_id(from_uid, channel_id, channel_type),
                            **agent_runtime_kwargs,
                        )
                        
                        # 6) AI succeeded, update visitor state to prevent duplicate triggers
                        if ai_result:
                            visitor.is_last_message_from_ai = True
                            visitor.is_last_message_from_visitor = False
                            visitor.last_client_msg_no = response_client_msg_no
                            visitor.ai_fallback_retry_count = 0  # Reset retry count on success
                            db.add(visitor)
                            db.commit()
                            logger.info(f"AI fallback completed for visitor {visitor.id}")
                        else:
                            # If handle_ai_response_non_stream returns None without exception
                            logger.warning(f"AI fallback returned no result for visitor {visitor.id}, incrementing retry count")
                            visitor.ai_fallback_retry_count += 1
                            db.add(visitor)
                            db.commit()
                            
                    except Exception as ai_error:
                        # AI request failed. Increment retry count.
                        logger.error(f"AI fallback failed for visitor {visitor.id}: {ai_error}")
                        visitor.ai_fallback_retry_count += 1
                        db.add(visitor)
                        db.commit()
                        continue
                    
                except Exception as e:
                    logger.error(f"Failed to process AI fallback for visitor {visitor.id}: {e}")
                    db.rollback()
                    continue

    except Exception as e:
        logger.error(f"Error in check_and_fallback_to_ai task: {e}", exc_info=True)
    finally:
        db.close()
