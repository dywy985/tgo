from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import html
import json
import os
from pathlib import Path
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfoNotFoundError
import unicodedata
import httpx

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.core.database import get_db
from app.core.security import get_current_active_user
from app.models import Platform, Staff, Ticket, TicketRoute, Visitor
from app.models.reply_monitor import (
    DEFAULT_WEEKLY_SCHEDULE,
    ReplyMonitorBatch,
    ReplyMonitorEvent,
    ReplyMonitorGroupCustomer,
    ReplyMonitorGroupPolicy,
    ReplyMonitorRebuildJob,
    ReplyMonitorMedia,
    ReplyMonitorMediaRecoveryCandidate,
    ReplyMonitorMediaRecoveryJob,
    WeComConversationBinding,
    WeComJumpGrant,
)
from app.schemas.reply_monitor import (
    ReplyMonitorEventCreate,
    ReplyMonitorEventResult,
    ReplyMonitorOwnerChatBindRequest,
    ReplyMonitorOwnerChatBindResult,
    ReplyMonitorCustomerRosterUpdate,
    ReplyMonitorMediaResponse,
    ReplyMonitorMediaResolveRequest,
    ReplyMonitorMediaResolveResult,
    ReplyMonitorMediaUploadResult,
    ReplyMonitorKnowledgeSuggestionResult,
    ReplyMonitorReplyMatchReview,
    ReplyMonitorRebuildPreviewRequest,
    ReplyMonitorRebuildSubmitRequest,
    ReplyMonitorOwnerOverrideUpdate,
    ReplyMonitorSettingsUpdate,
    ReplyMonitorRecoveryCandidateDecision,
    ReplyMonitorRecoveryStartRequest,
    WeComConversationActionRequest,
    WeComConversationActionResponse,
)
from app.services.transfer_service import _add_staff_to_channel
from app.services import reply_monitor_service
from app.services.worktool_ai_reply_service import parse_allowed_groups, process_event_ai_reply, should_auto_reply
from app.services.reply_monitor_media_service import MAX_IMAGE_BYTES, link_batch_media_to_ticket, sanitize_image, store_reply_monitor_media
from app.services.reply_monitor_image_analysis import analyze_image_text
from app.services.reply_monitor_suggestion_service import get_knowledge_suggestions
from app.services.reply_monitor_recovery_service import (
    build_recovery_targets,
    recovery_result_message,
    store_recovery_candidate,
)
from app.services.wecom_app_client import (
    build_wecom_sdk_config,
    fetch_external_customer_groups,
    find_wecom_jump_platform,
    get_wecom_oauth_userid,
    send_wecom_app_textcard,
)
from app.services.wecom_conversation_service import (
    hash_jump_token,
    issue_jump_grant,
    ExternalGroup,
    ObservedGroup,
    build_member_fingerprint,
    match_external_groups,
    normalize_group_name,
    validate_jump_grant,
)
from urllib.parse import quote

router = APIRouter()


async def bind_event_owner_to_visitor_chat(
    db: Session, platform: Platform, event: ReplyMonitorEvent, visitor: Visitor
) -> dict:
    staff_id = event.responsible_staff_id
    if staff_id is None:
        staff_id = reply_monitor_service._responsible_staff_id(
            db,
            platform,
            event.conversation_type,
            event.conversation_key,
            dict(event.event_metadata or {}),
        )
        event.responsible_staff_id = staff_id
    if staff_id is None:
        return {"bound": False, "responsible_staff_id": None, "reason": "unassigned"}
    await _add_staff_to_channel(
        db,
        platform.project_id,
        visitor.id,
        staff_id,
        ai_disabled=True,
        send_notification=False,
    )
    db.commit()
    return {"bound": True, "responsible_staff_id": staff_id, "reason": None}


def _wecom_action_state(db: Session, current_user: Staff, payload: WeComConversationActionRequest):
    binding = db.query(WeComConversationBinding).filter(
        WeComConversationBinding.project_id == current_user.project_id,
        WeComConversationBinding.platform_id == payload.platform_id,
        WeComConversationBinding.conversation_key == payload.conversation_key,
    ).first()
    if binding is None:
        return None, "syncing", "群绑定尚未同步"
    if binding.status != "available" or not binding.wecom_chat_id:
        return binding, binding.status, binding.reason or "没有已验证的企微客户群凭据"
    if not current_user.wecom_userid:
        return binding, "available", "当前客服未配置企微 UserID"
    if not str(app_settings.API_BASE_URL).startswith("https://"):
        return binding, "unsupported", "精准跳转需要 HTTPS 与企微可信域名"
    if find_wecom_jump_platform(db, current_user.project_id) is None:
        return binding, "unsupported", "未配置企微自建应用"
    return binding, "available", None


@router.post("/wecom-bindings/sync")
async def sync_wecom_bindings(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    app_platform = find_wecom_jump_platform(db, current_user.project_id)
    if app_platform is None:
        raise HTTPException(status_code=409, detail="未配置企微自建应用")
    try:
        external_rows = await fetch_external_customer_groups(app_platform)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    external_groups = [
        ExternalGroup(row["chat_id"], row["name"], row["owner"], row["members"])
        for row in external_rows
    ]
    events = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.project_id == current_user.project_id,
        ReplyMonitorEvent.conversation_type == "group",
    ).order_by(ReplyMonitorEvent.occurred_at.desc()).all()
    grouped: dict[tuple[UUID, str], list[ReplyMonitorEvent]] = {}
    for event in events:
        grouped.setdefault((event.platform_id, event.conversation_key), []).append(event)
    normalized_counts: dict[tuple[UUID, str, str], int] = {}
    observations = []
    for (platform_id, conversation_key), rows in grouped.items():
        latest = rows[0]
        name = str(latest.conversation_name or "")
        robot_id = str(latest.robot_id or "")
        count_key = (platform_id, robot_id, normalize_group_name(name))
        normalized_counts[count_key] = normalized_counts.get(count_key, 0) + 1
        metadata = next((row.event_metadata or {} for row in rows if (row.event_metadata or {}).get("group_owner_userid")), latest.event_metadata or {})
        members = tuple(str(row.sender_id) for row in rows if row.sender_id)
        observations.append((latest, ObservedGroup(
            platform_id=platform_id, conversation_key=conversation_key,
            robot_id=robot_id, conversation_name=name,
            owner_userid=metadata.get("group_owner_userid"), member_userids=members,
        ), count_key))
    counts = {"available": 0, "ambiguous": 0, "unsupported": 0, "syncing": 0}
    now = datetime.now(timezone.utc)
    for latest, observed, count_key in observations:
        if normalized_counts[count_key] > 1:
            match_status, chat_id, reason = "ambiguous", None, "同一 WorkTool 手机存在规范化重名群"
        else:
            matched = match_external_groups(observed, external_groups)
            match_status, chat_id, reason = matched.status, matched.chat_id, matched.reason
        binding = db.query(WeComConversationBinding).filter(
            WeComConversationBinding.project_id == current_user.project_id,
            WeComConversationBinding.platform_id == observed.platform_id,
            WeComConversationBinding.conversation_key == observed.conversation_key,
        ).first()
        if binding is None:
            binding = WeComConversationBinding(
                project_id=current_user.project_id, platform_id=observed.platform_id,
                conversation_key=observed.conversation_key,
                conversation_name=observed.conversation_name,
                normalized_name=normalize_group_name(observed.conversation_name),
            )
            db.add(binding)
        binding.robot_id = observed.robot_id
        binding.conversation_name = observed.conversation_name
        binding.normalized_name = normalize_group_name(observed.conversation_name)
        binding.owner_userid = observed.owner_userid
        binding.member_fingerprint = build_member_fingerprint(observed.member_userids) if observed.member_userids else None
        binding.wecom_chat_id = chat_id
        binding.status = match_status
        binding.reason = reason
        binding.source = "externalcontact_api"
        binding.verified_at = now if match_status == "available" else None
        counts[match_status] += 1
    db.commit()
    return {"ok": True, "counts": counts, "group_count": len(observations)}


@router.post("/wecom-action", response_model=WeComConversationActionResponse)
def get_wecom_action(
    payload: WeComConversationActionRequest,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    binding, action, reason = _wecom_action_state(db, current_user, payload)
    return WeComConversationActionResponse(
        wecom_action=action,
        can_dispatch_to_wecom=bool(binding and action == "available" and not reason),
        reason=reason,
    )


@router.post("/wecom-action/dispatch", response_model=WeComConversationActionResponse)
async def dispatch_wecom_action(
    payload: WeComConversationActionRequest,
    user_agent: Optional[str] = Header(None, alias="User-Agent"),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    binding, action, reason = _wecom_action_state(db, current_user, payload)
    if binding is None or action != "available" or reason:
        raise HTTPException(status_code=409, detail=reason or "精准跳转暂不可用")
    token, _grant = issue_jump_grant(db, binding, current_user)
    jump_url = f"{str(app_settings.API_BASE_URL).rstrip('/')}/v1/reply-monitor/wecom-jump/{token}"
    if "wxwork" in str(user_agent or "").casefold():
        db.commit()
        return WeComConversationActionResponse(
            wecom_action="available", can_dispatch_to_wecom=True, jump_url=jump_url
        )
    app_platform = find_wecom_jump_platform(db, current_user.project_id)
    sent = await send_wecom_app_textcard(
        app_platform,
        current_user.wecom_userid,
        "待回复群聊",
        f"会话：{binding.conversation_name}\n点击后精准打开原企业微信群。",
        jump_url,
    )
    if not sent:
        db.rollback()
        raise HTTPException(status_code=502, detail="精准跳转卡片发送失败")
    db.commit()
    return WeComConversationActionResponse(
        wecom_action="available", can_dispatch_to_wecom=True, dispatched=True
    )


@router.get("/wecom-jump/{token}", response_class=HTMLResponse)
async def open_wecom_group(
    token: str,
    request: Request,
    code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """OAuth-authorized page which is the only frontend allowed to receive chatId."""
    grant = db.query(WeComJumpGrant).filter(
        WeComJumpGrant.token_hash == hash_jump_token(token)
    ).first()
    if grant is None:
        raise HTTPException(status_code=404, detail="跳转凭据不存在")
    binding = db.query(WeComConversationBinding).filter(
        WeComConversationBinding.id == grant.binding_id,
        WeComConversationBinding.project_id == grant.project_id,
        WeComConversationBinding.status == "available",
    ).first()
    staff = db.query(Staff).filter(
        Staff.id == grant.staff_id,
        Staff.project_id == grant.project_id,
        Staff.is_active.is_(True),
        Staff.deleted_at.is_(None),
    ).first()
    platform = find_wecom_jump_platform(db, grant.project_id)
    if not binding or not binding.wecom_chat_id or not staff or not staff.wecom_userid or not platform:
        raise HTTPException(status_code=403, detail="跳转绑定或客服账号不可用")
    cfg = platform.config or {}
    if not code:
        callback_url = str(request.url).split("?", 1)[0]
        oauth_url = (
            "https://open.weixin.qq.com/connect/oauth2/authorize"
            f"?appid={quote(str(cfg.get('corp_id') or ''))}"
            f"&redirect_uri={quote(callback_url, safe='')}"
            "&response_type=code&scope=snsapi_base&state=jump#wechat_redirect"
        )
        return RedirectResponse(oauth_url, status_code=302)
    oauth_userid = await get_wecom_oauth_userid(platform, code)
    if not oauth_userid or oauth_userid.casefold() != str(staff.wecom_userid).casefold():
        raise HTTPException(status_code=403, detail="企微身份与跳转接收人不一致")
    now = datetime.now(timezone.utc)
    try:
        validate_jump_grant(grant, staff.id, now=now)
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    page_url = str(request.url)
    sdk = await build_wecom_sdk_config(platform, page_url)
    if sdk is None:
        raise HTTPException(status_code=503, detail="企微 JS-SDK 配置暂不可用")
    grant.used_at = now
    db.commit()
    data = json.dumps(
        {**sdk, "chat_id": binding.wecom_chat_id}, ensure_ascii=False
    ).replace("</", "<\\/")
    title = html.escape(binding.conversation_name)
    return HTMLResponse(f"""<!doctype html>
<html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
<title>前往企业微信</title><script src=\"https://res.wx.qq.com/open/js/jweixin-1.2.0.js\"></script></head>
<body><main><h3>正在打开：{title}</h3><p id=\"status\">正在校验企业微信环境…</p></main>
<script>
const d={data}; const statusNode=document.getElementById('status');
function fail(e){{statusNode.textContent='无法打开群聊：'+(e&&e.errMsg?e.errMsg:'请在企业微信中重试');}}
wx.config({{beta:true,debug:false,appId:d.corp_id,timestamp:d.timestamp,nonceStr:d.nonce,signature:d.corp_signature,jsApiList:['openEnterpriseChat']}});
wx.ready(function(){{wx.agentConfig({{corpid:d.corp_id,agentid:d.agent_id,timestamp:d.timestamp,nonceStr:d.nonce,signature:d.agent_signature,jsApiList:['openEnterpriseChat'],success:function(){{
  if(typeof wx.openEnterpriseChat==='function'){{wx.openEnterpriseChat({{chatId:d.chat_id,success:function(){{statusNode.textContent='已打开群聊';}},fail:fail}});}}
  else{{wx.invoke('openEnterpriseChat',{{chatId:d.chat_id}},function(r){{if(r.err_msg==='openEnterpriseChat:ok') statusNode.textContent='已打开群聊'; else fail(r);}});}}
}},fail:fail}});}}); wx.error(fail);
</script></body></html>""", headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


def _private_media_headers() -> dict[str, str]:
    return {
        "Cache-Control": "private, no-store",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
    }


def _resolve_private_media_path(base_dir: str, storage_path: str) -> Optional[Path]:
    base = Path(base_dir).resolve()
    candidate = (base / storage_path).resolve()
    if base not in candidate.parents or not candidate.is_file():
        return None
    return candidate


def _media_response(media: ReplyMonitorMedia) -> ReplyMonitorMediaResponse:
    return ReplyMonitorMediaResponse(
        id=media.id,
        content_type=media.content_type,
        file_size=media.file_size,
        width=media.width,
        height=media.height,
        status=media.status,
        url=f"/v1/reply-monitor/media/{media.id}",
        capture_source=getattr(media, "capture_source", "cache"),
    )


def _require_monitor_admin(current_user: Staff) -> Staff:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project administrators may change reply-monitor settings",
        )
    return current_user


def _platform_by_key(db: Session, key: Optional[str]) -> Platform:
    if not key:
        raise HTTPException(status_code=401, detail="Missing platform API key")
    platform = db.query(Platform).filter(Platform.api_key == key, Platform.is_active.is_(True), Platform.deleted_at.is_(None)).first()
    if not platform:
        raise HTTPException(status_code=401, detail="Invalid platform API key")
    if platform.type != "worktool":
        raise HTTPException(status_code=400, detail="Reply monitoring currently supports WorkTool only")
    return platform


@router.post("/events", response_model=ReplyMonitorEventResult)
def create_event(payload: ReplyMonitorEventCreate, background_tasks: BackgroundTasks, x_platform_api_key: Optional[str] = Header(None, alias="X-Platform-API-Key"), db: Session = Depends(get_db)):
    platform = _platform_by_key(db, x_platform_api_key)
    event, batch, duplicate, ignored = reply_monitor_service.ingest_event(db, platform, payload)
    if (
        os.getenv("WORKTOOL_AI_TEST_ENABLED", "false").lower() == "true"
        and payload.conversation_type == "group"
        and bool(os.getenv("WORKTOOL_AI_TEST_ROBOT_ID"))
        and event.robot_id == os.getenv("WORKTOOL_AI_TEST_ROBOT_ID")
        and should_auto_reply(
            conversation_name=event.conversation_name,
            sender_kind=event.sender_kind,
            message_type=event.message_type,
            content=event.current_content,
            duplicate=duplicate,
            ignored=ignored,
            has_pending_batch=bool(batch and batch.status == "pending"),
            allowed_groups=parse_allowed_groups(os.getenv("WORKTOOL_AI_TEST_GROUPS")),
        )
    ):
        background_tasks.add_task(process_event_ai_reply, str(event.id), str(platform.id))
    return ReplyMonitorEventResult(
        duplicate=duplicate, ignored=ignored, event_id=event.id,
        batch_id=batch.id if batch else None, reply_status=batch.status if batch else None,
        responsible_staff_id=(batch.responsible_staff_id if batch else event.responsible_staff_id),
        actual_reply_staff_id=batch.actual_reply_staff_id if batch else None,
        pending_reply_since=batch.first_customer_at if batch and batch.status == "pending" else None,
        reminder_count=batch.reminder_count if batch else 0,
        effective_sender_kind=event.sender_kind,
        effective_sender_name=event.sender_name,
        reply_match_status=event.reply_match_status,
        reply_actor_kind=event.reply_actor_kind,
    )


@router.post(
    "/events/{message_id}/owner-chat",
    response_model=ReplyMonitorOwnerChatBindResult,
)
async def bind_event_owner_chat(
    message_id: str,
    payload: ReplyMonitorOwnerChatBindRequest,
    x_platform_api_key: Optional[str] = Header(None, alias="X-Platform-API-Key"),
    db: Session = Depends(get_db),
) -> ReplyMonitorOwnerChatBindResult:
    platform = _platform_by_key(db, x_platform_api_key)
    event = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.platform_id == platform.id,
        ReplyMonitorEvent.message_id == message_id,
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Reply monitor event not found")
    visitor = db.get(Visitor, payload.visitor_id)
    if not visitor or visitor.project_id != platform.project_id or visitor.platform_id != platform.id:
        raise HTTPException(status_code=404, detail="Visitor not found")
    result = await bind_event_owner_to_visitor_chat(db, platform, event, visitor)
    return ReplyMonitorOwnerChatBindResult(**result)


@router.post(
    "/events/{message_id}/media",
    response_model=ReplyMonitorMediaUploadResult,
    status_code=status.HTTP_201_CREATED,
)
async def upload_event_media(
    message_id: str,
    file: UploadFile = File(...),
    capture_source: str = Form("cache"),
    x_platform_api_key: Optional[str] = Header(None, alias="X-Platform-API-Key"),
    db: Session = Depends(get_db),
) -> ReplyMonitorMediaUploadResult:
    platform = _platform_by_key(db, x_platform_api_key)
    content = await file.read(MAX_IMAGE_BYTES + 1)
    try:
        media, duplicate = await store_reply_monitor_media(
            db,
            platform,
            message_id,
            content,
            file.content_type or "",
            file.filename or "image",
            capture_source,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Reply-monitor event not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    event = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.platform_id == platform.id,
        ReplyMonitorEvent.message_id == message_id,
    ).first()
    metadata = dict(event.event_metadata or {}) if event else {}
    batch = None
    # A retry may find bytes stored by an earlier request that stopped before
    # OCR metadata was committed. In that case, finish analysis on the retry.
    if event and not metadata.get("ocr_status"):
        normalized = sanitize_image(
            content, file.content_type or "", file.filename or "image",
            crop_screen_preview=capture_source in {"screen_crop", "recovered_screen_crop"},
        )
        analysis = analyze_image_text(normalized.content)
        batch = reply_monitor_service.apply_image_text_analysis(
            db, platform, event, analysis
        )
        metadata = dict(event.event_metadata or {})
    return ReplyMonitorMediaUploadResult(
        duplicate=duplicate,
        media=_media_response(media),
        ocr_status=metadata.get("ocr_status"),
        ocr_text=metadata.get("ocr_text"),
        problem_score=metadata.get("problem_score") if metadata.get("problem_source") == "image_ocr" else None,
        problem_batch_id=(batch.id if batch else event.batch_id if event else None),
    )


def _recovery_preview(db: Session, project_id: UUID, platform_id: UUID):
    events = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.project_id == project_id,
        ReplyMonitorEvent.platform_id == platform_id,
    ).order_by(ReplyMonitorEvent.occurred_at.asc()).all()
    media_ids = {
        row[0] for row in db.query(ReplyMonitorMedia.message_id).filter(
            ReplyMonitorMedia.project_id == project_id,
            ReplyMonitorMedia.platform_id == platform_id,
            ReplyMonitorMedia.status == "ready",
        ).all()
    }
    return build_recovery_targets(events, media_message_ids=media_ids)


@router.get("/media-recovery/preview")
def preview_media_recovery(
    platform_id: UUID = Query(...), db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    _override_platform(db, current_user.project_id, platform_id)
    targets = _recovery_preview(db, current_user.project_id, platform_id)
    return {"count": len(targets), "targets": [
        {"event_id": item.event_id, "message_id": item.message_id,
         "conversation_key": item.conversation_key, "conversation_name": item.conversation_name,
         "sender_name": item.sender_name, "occurred_at": item.occurred_at,
         "previous_text": item.previous_text, "next_text": item.next_text}
        for item in targets
    ]}


@router.post("/media-recovery/jobs")
async def start_media_recovery(
    payload: ReplyMonitorRecoveryStartRequest, db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    platform = _override_platform(db, current_user.project_id, payload.platform_id)
    available = {item.event_id: item for item in _recovery_preview(db, current_user.project_id, payload.platform_id)}
    if any(event_id not in available for event_id in payload.event_ids):
        raise HTTPException(status_code=409, detail="恢复目标已变化，请重新预览")
    selected = [available[event_id] for event_id in payload.event_ids]
    robot_ids = {item.robot_id for item in selected if item.robot_id}
    if len(robot_ids) != 1:
        raise HTTPException(status_code=409, detail="恢复目标必须来自同一台 WorkTool 手机")
    normalized_groups: dict[str, set[str]] = {}
    for target in selected:
        normalized_groups.setdefault(normalize_group_name(target.conversation_name), set()).add(target.conversation_key)
    if any(len(keys) > 1 for keys in normalized_groups.values()):
        raise HTTPException(status_code=409, detail="存在规范化重名群，已终止恢复")
    job = ReplyMonitorMediaRecoveryJob(
        project_id=current_user.project_id, platform_id=platform.id,
        actor_staff_id=current_user.id, status="queued", progress=0,
        target_event_ids=[str(item.event_id) for item in selected],
    )
    db.add(job); db.commit(); db.refresh(job)
    cfg = platform.config or {}
    gateway_url = str(cfg.get("gateway_url") or "").rstrip("/")
    if not gateway_url:
        job.status, job.error = "failed", "WorkTool 网关未配置"
        db.commit()
        raise HTTPException(status_code=409, detail=job.error)
    command = {
        "job_id": str(job.id), "robot_id": next(iter(robot_ids)),
        "pause_active_operations": True, "resume_from_cursor": True,
        "limits": {"max_group_seconds": 600, "max_scrolls": 300, "stop_on_repeated_frame": True},
        "targets": [{"event_id": str(item.event_id), "message_id": item.message_id,
                     "group_name": item.conversation_name, "sender_name": item.sender_name,
                     "occurred_at": item.occurred_at.isoformat(), "previous_text": item.previous_text,
                     "next_text": item.next_text} for item in selected],
    }
    try:
        control_token = os.getenv("WORKTOOL_CONTROL_TOKEN") or os.getenv("WECOM_DEBUG_WORKTOOL_API_KEY", "")
        headers = {"X-API-Key": control_token} if control_token else {}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{gateway_url}/api/media-recovery", json=command, headers=headers)
            response.raise_for_status()
        job.status, job.started_at = "running", datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:  # noqa: BLE001
        job.status, job.error = "failed", f"网关拒绝恢复任务：{type(exc).__name__}"
        db.commit()
        raise HTTPException(status_code=502, detail=job.error) from exc
    return {"job_id": job.id, "status": job.status, "target_count": len(selected)}


@router.post("/media-recovery/jobs/{job_id}/cancel")
async def cancel_media_recovery(
    job_id: UUID, db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    job = db.query(ReplyMonitorMediaRecoveryJob).filter(
        ReplyMonitorMediaRecoveryJob.id == job_id,
        ReplyMonitorMediaRecoveryJob.project_id == current_user.project_id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="恢复任务不存在")
    job.cancel_requested = True
    if job.status in {"queued", "running"}:
        job.status = "cancelling"
    db.commit()
    platform = _override_platform(db, current_user.project_id, job.platform_id)
    cfg = platform.config or {}
    gateway_url = str(cfg.get("gateway_url") or "").rstrip("/")
    if gateway_url:
        try:
            control_token = os.getenv("WORKTOOL_CONTROL_TOKEN") or os.getenv("WECOM_DEBUG_WORKTOOL_API_KEY", "")
            headers = {"X-API-Key": control_token} if control_token else {}
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{gateway_url}/api/media-recovery/{job_id}/cancel", headers=headers
                )
                response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            job.error = f"取消指令暂未送达网关：{type(exc).__name__}"
            db.commit()
            return {"ok": False, "status": job.status, "reason": job.error}
    return {"ok": True, "status": job.status}


@router.post("/media-recovery/jobs/{job_id}/status")
def update_media_recovery_status(
    job_id: UUID,
    payload: dict = Body(...),
    x_platform_api_key: Optional[str] = Header(None, alias="X-Platform-API-Key"),
    db: Session = Depends(get_db),
):
    """Device progress callback relayed by the WorkTool gateway."""
    platform = _platform_by_key(db, x_platform_api_key)
    job = db.query(ReplyMonitorMediaRecoveryJob).filter(
        ReplyMonitorMediaRecoveryJob.id == job_id,
        ReplyMonitorMediaRecoveryJob.project_id == platform.project_id,
        ReplyMonitorMediaRecoveryJob.platform_id == platform.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="恢复任务不存在")
    next_status = str(payload.get("status") or "")
    if next_status not in {"running", "completed", "cancelled", "failed"}:
        raise HTTPException(status_code=400, detail="恢复任务状态无效")
    job.status = next_status
    job.progress = min(100, max(0, int(payload.get("progress") or 0)))
    job.error = str(payload.get("error") or "")[:1000] or None
    if next_status in {"completed", "cancelled", "failed"}:
        job.completed_at = datetime.now(timezone.utc)
        job.result = {
            "candidate_count": db.query(ReplyMonitorMediaRecoveryCandidate).filter_by(job_id=job.id).count(),
            "target_count": len(job.target_event_ids or []),
        }
    db.commit()
    return {"ok": True, "status": job.status, "progress": job.progress}


@router.post("/media-recovery/jobs/{job_id}/candidates", status_code=201)
async def upload_recovery_candidate(
    job_id: UUID, event_id: UUID = Form(...), message_id: str = Form(...),
    capture_source: str = Form(...), evidence_json: str = Form("{}"), file: UploadFile = File(...),
    x_platform_api_key: Optional[str] = Header(None, alias="X-Platform-API-Key"),
    db: Session = Depends(get_db),
):
    platform = _platform_by_key(db, x_platform_api_key)
    job = db.query(ReplyMonitorMediaRecoveryJob).filter(
        ReplyMonitorMediaRecoveryJob.id == job_id,
        ReplyMonitorMediaRecoveryJob.project_id == platform.project_id,
        ReplyMonitorMediaRecoveryJob.platform_id == platform.id,
        ReplyMonitorMediaRecoveryJob.status.in_(["running", "cancelling"]),
    ).first()
    event = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.id == event_id, ReplyMonitorEvent.project_id == platform.project_id,
        ReplyMonitorEvent.platform_id == platform.id, ReplyMonitorEvent.message_id == message_id,
    ).first()
    if not job or not event or str(event_id) not in (job.target_event_ids or []):
        raise HTTPException(status_code=404, detail="恢复目标不存在")
    try:
        evidence = json.loads(evidence_json)
        candidate, duplicate = await store_recovery_candidate(
            db, job, event, await file.read(MAX_IMAGE_BYTES + 1), file.content_type or "",
            file.filename or "recovered-image", capture_source, evidence,
        )
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"candidate_id": candidate.id, "duplicate": duplicate, "status": candidate.status}


@router.get("/media-recovery/jobs/{job_id}")
def get_media_recovery_job(
    job_id: UUID, db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    job = db.query(ReplyMonitorMediaRecoveryJob).filter(
        ReplyMonitorMediaRecoveryJob.id == job_id,
        ReplyMonitorMediaRecoveryJob.project_id == current_user.project_id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="恢复任务不存在")
    candidates = db.query(ReplyMonitorMediaRecoveryCandidate).filter_by(
        job_id=job.id, project_id=current_user.project_id,
    ).order_by(ReplyMonitorMediaRecoveryCandidate.created_at.asc()).all()
    candidate_count = len(candidates)
    return {
        "job_id": job.id, "status": job.status, "progress": job.progress,
        "error": job.error, "target_count": len(job.target_event_ids or []),
        "candidate_count": candidate_count,
        "result_message": recovery_result_message(job.status, candidate_count),
        "candidates": [{
            "candidate_id": row.id, "event_id": row.event_id,
            "message_id": row.message_id, "capture_source": row.capture_source,
            "status": row.status, "width": row.width, "height": row.height,
            "created_at": row.created_at,
            "content_url": f"/v1/reply-monitor/media-recovery/candidates/{row.id}/content",
        } for row in candidates],
    }


@router.get("/media-recovery/candidates/{candidate_id}/content", response_class=FileResponse)
def get_recovery_candidate_content(
    candidate_id: UUID, db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> FileResponse:
    _require_monitor_admin(current_user)
    candidate = db.query(ReplyMonitorMediaRecoveryCandidate).filter(
        ReplyMonitorMediaRecoveryCandidate.id == candidate_id,
        ReplyMonitorMediaRecoveryCandidate.project_id == current_user.project_id,
    ).first()
    if candidate is None:
        raise HTTPException(status_code=404, detail="候选图片不存在")
    file_path = _resolve_private_media_path(app_settings.UPLOAD_BASE_DIR, candidate.storage_path)
    if file_path is None:
        raise HTTPException(status_code=404, detail="候选图片文件不存在")
    return FileResponse(
        path=file_path, media_type=candidate.content_type,
        filename=candidate.original_name, content_disposition_type="inline",
        headers=_private_media_headers(),
    )


@router.post("/media-recovery/candidates/{candidate_id}")
def decide_recovery_candidate(
    candidate_id: UUID, payload: ReplyMonitorRecoveryCandidateDecision,
    db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    candidate = db.query(ReplyMonitorMediaRecoveryCandidate).filter(
        ReplyMonitorMediaRecoveryCandidate.id == candidate_id,
        ReplyMonitorMediaRecoveryCandidate.project_id == current_user.project_id,
        ReplyMonitorMediaRecoveryCandidate.status == "pending",
    ).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="待确认候选图片不存在")
    if payload.decision == "reject":
        candidate.status, candidate.reviewed_by_staff_id = "rejected", current_user.id
        candidate.reviewed_at = datetime.now(timezone.utc); db.commit()
        return {"ok": True, "status": "rejected"}
    event = db.get(ReplyMonitorEvent, candidate.event_id)
    duplicate = db.query(ReplyMonitorMedia).filter(
        ReplyMonitorMedia.platform_id == event.platform_id,
        ReplyMonitorMedia.message_id == event.message_id,
        ReplyMonitorMedia.sha256 == candidate.sha256,
    ).first()
    if duplicate is None:
        media = ReplyMonitorMedia(
            project_id=candidate.project_id, platform_id=event.platform_id, event_id=event.id,
            batch_id=event.batch_id, message_id=event.message_id, original_name=candidate.original_name,
            storage_path=candidate.storage_path, content_type=candidate.content_type,
            file_size=candidate.file_size, sha256=candidate.sha256, width=candidate.width,
            height=candidate.height, status="ready", capture_source=candidate.capture_source,
            expires_at=datetime.now(timezone.utc) + timedelta(days=app_settings.REPLY_MONITOR_RETENTION_DAYS),
        )
        db.add(media); db.flush()
        if event.batch_id:
            batch = db.get(ReplyMonitorBatch, event.batch_id)
            ticket = db.get(Ticket, batch.ticket_id) if batch and batch.ticket_id else None
            if ticket:
                link_batch_media_to_ticket(db, event.batch_id, ticket, project_id=current_user.project_id)
    candidate.status, candidate.reviewed_by_staff_id = "confirmed", current_user.id
    candidate.reviewed_at = datetime.now(timezone.utc); db.commit()
    return {"ok": True, "status": "confirmed", "duplicate": duplicate is not None}


@router.post("/media/resolve", response_model=ReplyMonitorMediaResolveResult)
def resolve_monitor_media(
    payload: ReplyMonitorMediaResolveRequest,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> ReplyMonitorMediaResolveResult:
    rows = db.query(ReplyMonitorMedia).filter(
        ReplyMonitorMedia.project_id == current_user.project_id,
        ReplyMonitorMedia.message_id.in_(payload.monitor_message_ids),
    ).order_by(ReplyMonitorMedia.created_at.asc()).all()
    items = {message_id: [] for message_id in payload.monitor_message_ids}
    for media in rows:
        items[media.message_id].append(_media_response(media))
    return ReplyMonitorMediaResolveResult(items=items)


@router.get("/media/{media_id}", response_class=FileResponse)
async def get_monitor_media(
    media_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
) -> FileResponse:
    media = (
        db.query(ReplyMonitorMedia)
        .filter(
            ReplyMonitorMedia.id == media_id,
            ReplyMonitorMedia.project_id == current_user.project_id,
            ReplyMonitorMedia.status == "ready",
        )
        .first()
    )
    if media is None:
        raise HTTPException(status_code=404, detail="Media not found")
    file_path = _resolve_private_media_path(app_settings.UPLOAD_BASE_DIR, media.storage_path)
    if file_path is None:
        raise HTTPException(status_code=404, detail="Media file not found")
    return FileResponse(
        path=file_path,
        media_type=media.content_type,
        filename=media.original_name,
        content_disposition_type="inline",
        headers=_private_media_headers(),
    )


def _settings_dict(row) -> dict:
    return {"enabled": row.enabled, "reminders_enabled": row.reminders_enabled,
            "timezone": row.timezone, "weekly_schedule": row.weekly_schedule,
            "first_reminder_minutes": row.first_reminder_minutes, "repeat_reminder_minutes": row.repeat_reminder_minutes,
            "max_reminders": row.max_reminders,
            "wecom_digest_minutes": getattr(row, "wecom_digest_minutes", 5),
            "wecom_digest_max_items": getattr(row, "wecom_digest_max_items", 10),
            "notification_channels": row.notification_channels,
            "ai_reply_frozen": app_settings.AI_REPLY_FROZEN}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)):
    row = reply_monitor_service.get_or_create_settings(db, current_user.project_id)
    db.commit()
    return _settings_dict(row)


def _staff_display_name(staff: Optional[Staff]) -> Optional[str]:
    return (staff.name or staff.nickname or staff.username) if staff else None


def _observed_member_candidate(event) -> Optional[dict]:
    if str(getattr(event, "sender_kind", "")) == "system":
        return None
    sender_id = reply_monitor_service.normalize_member_identity(
        getattr(event, "sender_id", None)
    )
    raw_name = " ".join(
        unicodedata.normalize(
            "NFKC", str(getattr(event, "sender_name", None) or "")
        ).split()
    )
    sender_name = reply_monitor_service.normalize_member_identity(raw_name)
    if sender_id:
        return {
            "identity_type": "userid",
            "identity_value": sender_id,
            "display_name": raw_name or sender_id,
        }
    if sender_name:
        return {
            "identity_type": "name",
            "identity_value": sender_name,
            "display_name": raw_name,
        }
    return None


def _group_owner_rows(db: Session, project_id: UUID) -> list[dict]:
    events = db.query(ReplyMonitorEvent).join(
        Platform, ReplyMonitorEvent.platform_id == Platform.id
    ).filter(
        ReplyMonitorEvent.project_id == project_id,
        ReplyMonitorEvent.conversation_type == "group",
        Platform.type == "worktool",
        Platform.deleted_at.is_(None),
    ).order_by(ReplyMonitorEvent.occurred_at.desc()).limit(5000).all()
    latest = {}
    detected = {}
    for event in events:
        key = (event.platform_id, event.conversation_key)
        latest.setdefault(key, event)
        metadata = event.event_metadata or {}
        if key not in detected and (
            metadata.get("group_owner_userid") or metadata.get("group_owner_name")
        ):
            detected[key] = metadata
    roster_rows = db.query(ReplyMonitorGroupCustomer).filter(
        ReplyMonitorGroupCustomer.project_id == project_id
    ).all()
    roster_by_group: dict[tuple[UUID, str], list[ReplyMonitorGroupCustomer]] = {}
    for member in roster_rows:
        roster_by_group.setdefault((member.platform_id, member.conversation_key), []).append(member)
    policies = db.query(ReplyMonitorGroupPolicy).filter(
        ReplyMonitorGroupPolicy.project_id == project_id
    ).all()
    policy_by_group = {
        (row.platform_id, row.conversation_key): row for row in policies
    }
    staff_rows = db.query(Staff).filter(
        Staff.project_id == project_id,
        Staff.is_active.is_(True),
        Staff.deleted_at.is_(None),
        Staff.role != "agent",
    ).all()
    internal_member_keys = {
        f"userid:{value}"
        for row in staff_rows
        for value in [reply_monitor_service.normalize_member_identity(row.wecom_userid)]
        if value
    }
    internal_member_keys.update({
        f"name:{value}"
        for row in staff_rows
        for field in ("name", "nickname", "username")
        for value in [reply_monitor_service.normalize_member_identity(getattr(row, field, None))]
        if value
    })
    observed_by_group: dict[tuple[UUID, str], dict[tuple[str, str], dict]] = {}
    for event in events:
        candidate = _observed_member_candidate(event)
        if candidate:
            observed_by_group.setdefault(
                (event.platform_id, event.conversation_key), {}
            )[(candidate["identity_type"], candidate["identity_value"])] = candidate

    result = []
    for key, event in latest.items():
        platform = db.get(Platform, event.platform_id)
        metadata = detected.get(key, event.event_metadata or {})
        staff, source = reply_monitor_service.resolve_group_responsibility(
            db, platform, event.conversation_key, metadata
        )
        policy = policy_by_group.get(key)
        owner_keys = {
            f"userid:{value}"
            for value in [reply_monitor_service.normalize_member_identity(metadata.get("group_owner_userid"))]
            if value
        }
        owner_keys.update({
            f"name:{value}"
            for value in [reply_monitor_service.normalize_member_identity(metadata.get("group_owner_name"))]
            if value
        })
        observed_members = sorted(
            (
                member for member in observed_by_group.get(key, {}).values()
                if f'{member["identity_type"]}:{member["identity_value"]}'
                not in internal_member_keys | owner_keys
            ),
            key=lambda item: item["display_name"],
        )
        reviewed_keys = set(policy.observed_member_keys or []) if policy else set()
        unreviewed_members = [
            member for member in observed_members
            if f'{member["identity_type"]}:{member["identity_value"]}' not in reviewed_keys
        ]
        result.append({
            "platform_id": event.platform_id,
            "platform_name": platform.name,
            "group_key": event.conversation_key,
            "group_name": event.conversation_name,
            "detected_owner_userid": metadata.get("group_owner_userid"),
            "detected_owner_name": metadata.get("group_owner_name"),
            "effective_staff_id": staff.id if staff else None,
            "effective_staff_name": _staff_display_name(staff),
            "assignment_source": source,
            "customer_roster_configured": bool(policy and policy.roster_confirmed),
            "roster_version": policy.roster_version if policy else 0,
            "roster_confirmed_at": policy.confirmed_at if policy else None,
            "customer_members": [
                {
                    "identity_type": member.identity_type,
                    "identity_value": member.identity_value,
                    "display_name": member.display_name or member.identity_value,
                }
                for member in roster_by_group.get(key, [])
            ],
            "observed_members": observed_members,
            "unreviewed_members": unreviewed_members,
            "updated_at": event.occurred_at,
        })
    return sorted(result, key=lambda row: (row["group_name"] or row["group_key"]))


@router.get("/group-owners")
def list_group_owners(
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    return _group_owner_rows(db, current_user.project_id)


def _override_platform(db: Session, project_id: UUID, platform_id: UUID) -> Platform:
    platform = db.query(Platform).filter(
        Platform.id == platform_id,
        Platform.project_id == project_id,
        Platform.type == "worktool",
        Platform.deleted_at.is_(None),
    ).first()
    if platform is None:
        raise HTTPException(status_code=404, detail="WorkTool platform not found")
    return platform


@router.put("/group-owners/{platform_id}")
def set_group_owner_override(
    platform_id: UUID,
    payload: ReplyMonitorOwnerOverrideUpdate,
    group_key: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    _override_platform(db, current_user.project_id, platform_id)
    staff = db.query(Staff).filter(
        Staff.id == payload.staff_id,
        Staff.project_id == current_user.project_id,
        Staff.is_active.is_(True),
        Staff.deleted_at.is_(None),
        Staff.role != "agent",
    ).first()
    if staff is None:
        raise HTTPException(status_code=400, detail="负责人必须是本项目的启用真人客服")
    route = db.query(TicketRoute).filter(
        TicketRoute.project_id == current_user.project_id,
        TicketRoute.platform_id == platform_id,
        TicketRoute.group_key == group_key,
        TicketRoute.visitor_key.is_(None),
        TicketRoute.deleted_at.is_(None),
    ).order_by(TicketRoute.priority.desc()).first()
    if route is None:
        route = TicketRoute(
            project_id=current_user.project_id, platform_id=platform_id,
            group_key=group_key, visitor_key=None, staff_name=_staff_display_name(staff),
            priority=100,
        )
        db.add(route)
    route.staff_id = staff.id
    route.staff_name = _staff_display_name(staff)
    route.wecom_userid = staff.wecom_userid
    route.deleted_at = None
    db.commit()
    reminder_note = "" if staff.wecom_userid else "；该客服未配置企微 UserID，将仅接收站内提醒"
    return {"ok": True, "message": f"群聊负责人已修改，将用于之后的新问题和转人工{reminder_note}"}


@router.delete("/group-owners/{platform_id}")
def clear_group_owner_override(
    platform_id: UUID,
    group_key: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    _override_platform(db, current_user.project_id, platform_id)
    routes = db.query(TicketRoute).filter(
        TicketRoute.project_id == current_user.project_id,
        TicketRoute.platform_id == platform_id,
        TicketRoute.group_key == group_key,
        TicketRoute.visitor_key.is_(None),
        TicketRoute.deleted_at.is_(None),
    ).all()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for route in routes:
        route.deleted_at = now
    db.commit()
    return {"ok": True, "message": "群聊负责人已恢复为群主，仅影响之后新产生的问题"}


@router.put("/group-customers/{platform_id}")
def set_group_customer_roster(
    platform_id: UUID,
    payload: ReplyMonitorCustomerRosterUpdate,
    group_key: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    _override_platform(db, current_user.project_id, platform_id)
    db.query(ReplyMonitorGroupCustomer).filter(
        ReplyMonitorGroupCustomer.project_id == current_user.project_id,
        ReplyMonitorGroupCustomer.platform_id == platform_id,
        ReplyMonitorGroupCustomer.conversation_key == group_key,
    ).delete(synchronize_session=False)
    for member in payload.customer_members:
        db.add(ReplyMonitorGroupCustomer(
            project_id=current_user.project_id,
            platform_id=platform_id,
            conversation_key=group_key,
            identity_type=member.identity_type,
            identity_value=member.identity_value,
            display_name=member.display_name or member.identity_value,
        ))
    observed_events = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.project_id == current_user.project_id,
        ReplyMonitorEvent.platform_id == platform_id,
        ReplyMonitorEvent.conversation_key == group_key,
    ).order_by(ReplyMonitorEvent.occurred_at.desc()).limit(5000).all()
    observed_keys = sorted({
        f'{candidate["identity_type"]}:{candidate["identity_value"]}'
        for candidate in (_observed_member_candidate(event) for event in observed_events)
        if candidate
    })
    policy = db.query(ReplyMonitorGroupPolicy).filter(
        ReplyMonitorGroupPolicy.project_id == current_user.project_id,
        ReplyMonitorGroupPolicy.platform_id == platform_id,
        ReplyMonitorGroupPolicy.conversation_key == group_key,
    ).first()
    now = datetime.now(timezone.utc)
    if policy is None:
        policy = ReplyMonitorGroupPolicy(
            project_id=current_user.project_id,
            platform_id=platform_id,
            conversation_key=group_key,
            roster_version=1,
        )
        db.add(policy)
    else:
        policy.roster_version = int(policy.roster_version or 0) + 1
    policy.roster_confirmed = True
    policy.confirmed_by_staff_id = current_user.id
    policy.confirmed_at = now
    policy.observed_member_keys = observed_keys
    db.commit()
    return {
        "ok": True,
        "message": "客户成员已保存；之后的新消息按此名单识别",
        "roster_version": policy.roster_version,
        "historical_rebuild_required": True,
    }


@router.delete("/group-customers/{platform_id}")
def clear_group_customer_roster(
    platform_id: UUID,
    group_key: str = Query(..., min_length=1, max_length=255),
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    _override_platform(db, current_user.project_id, platform_id)
    deleted = db.query(ReplyMonitorGroupCustomer).filter(
        ReplyMonitorGroupCustomer.project_id == current_user.project_id,
        ReplyMonitorGroupCustomer.platform_id == platform_id,
        ReplyMonitorGroupCustomer.conversation_key == group_key,
    ).delete(synchronize_session=False)
    policy = db.query(ReplyMonitorGroupPolicy).filter(
        ReplyMonitorGroupPolicy.project_id == current_user.project_id,
        ReplyMonitorGroupPolicy.platform_id == platform_id,
        ReplyMonitorGroupPolicy.conversation_key == group_key,
    ).first()
    if policy:
        policy.roster_confirmed = False
        policy.roster_version = int(policy.roster_version or 0) + 1
        policy.confirmed_by_staff_id = current_user.id
        policy.confirmed_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "deleted": int(deleted or 0), "message": "客户成员名单已清除"}


def _validate_rebuild_window(start_at: datetime, end_at: datetime) -> None:
    if start_at.tzinfo is None or end_at.tzinfo is None or start_at >= end_at:
        raise HTTPException(status_code=400, detail="回补时间范围无效或缺少时区")
    if end_at - start_at > timedelta(days=31):
        raise HTTPException(status_code=400, detail="单次回补范围不能超过 31 天")


@router.post("/history-rebuild/preview")
def preview_history_rebuild(
    payload: ReplyMonitorRebuildPreviewRequest,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    _validate_rebuild_window(payload.start_at, payload.end_at)
    platform = _override_platform(db, current_user.project_id, payload.platform_id)
    from app.services.reply_monitor_rebuild_service import create_preview_token, preview_historical_window
    events, items, snapshot = preview_historical_window(
        db, platform, payload.start_at, payload.end_at
    )
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    token = create_preview_token(
        app_settings.SECRET_KEY,
        str(current_user.project_id),
        str(platform.id),
        payload.start_at,
        payload.end_at,
        snapshot,
        expires_at,
    )
    return {
        "event_count": len(events),
        "items": items,
        "snapshot": snapshot,
        "preview_token": token,
        "expires_at": expires_at,
    }


@router.post("/history-rebuild/jobs", status_code=202)
def submit_history_rebuild(
    payload: ReplyMonitorRebuildSubmitRequest,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    _validate_rebuild_window(payload.start_at, payload.end_at)
    platform = _override_platform(db, current_user.project_id, payload.platform_id)
    from app.services.reply_monitor_rebuild_service import (
        decode_preview_token, preview_historical_window, rebuild_historical_window,
    )
    try:
        claims = decode_preview_token(app_settings.SECRET_KEY, payload.preview_token)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _, _, current_snapshot = preview_historical_window(
        db, platform, payload.start_at, payload.end_at
    )
    if (
        claims.get("project_id") != str(current_user.project_id)
        or claims.get("platform_id") != str(platform.id)
        or claims.get("start_at") != payload.start_at.astimezone(timezone.utc).isoformat()
        or claims.get("end_at") != payload.end_at.astimezone(timezone.utc).isoformat()
        or claims.get("snapshot") != current_snapshot
    ):
        raise HTTPException(status_code=409, detail="回补预览已过期或数据快照发生变化")
    job = ReplyMonitorRebuildJob(
        project_id=current_user.project_id,
        platform_id=platform.id,
        requested_by_staff_id=current_user.id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        snapshot=current_snapshot,
        status="running",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    try:
        result = rebuild_historical_window(
            db, platform, payload.start_at, payload.end_at
        )
        job = db.get(ReplyMonitorRebuildJob, job.id)
        job.status = "completed"
        job.result = result
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
    except Exception as exc:
        db.rollback()
        failed_job = db.get(ReplyMonitorRebuildJob, job.id)
        if failed_job is not None:
            failed_job.status = "failed"
            failed_job.error_message = str(exc)[:2000]
            failed_job.completed_at = datetime.now(timezone.utc)
            db.commit()
        raise
    return _rebuild_job_response(job)


def _rebuild_job_response(job: ReplyMonitorRebuildJob) -> dict:
    return {
        "job_id": job.id,
        "status": job.status,
        "result": job.result or {},
        "error_message": job.error_message,
        "created_at": job.created_at,
        "completed_at": job.completed_at,
    }


@router.get("/history-rebuild/jobs/{job_id}")
def get_history_rebuild_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    job = db.query(ReplyMonitorRebuildJob).filter(
        ReplyMonitorRebuildJob.id == job_id,
        ReplyMonitorRebuildJob.project_id == current_user.project_id,
    ).first()
    if job is None:
        raise HTTPException(status_code=404, detail="回补任务不存在")
    return _rebuild_job_response(job)


@router.put("/settings")
def update_settings(payload: ReplyMonitorSettingsUpdate, db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)):
    _require_monitor_admin(current_user)
    try:
        reply_monitor_service.resolve_timezone(payload.timezone)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=400, detail="Unknown timezone") from exc
    row = reply_monitor_service.get_or_create_settings(db, current_user.project_id)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    if row.enabled:
        reply_monitor_service.rearm_pending_batches(
            db, current_user.project_id, row
        )
    db.commit(); db.refresh(row)
    return _settings_dict(row)


@router.delete("/pending/{batch_id}")
def dismiss_pending(
    batch_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    if not reply_monitor_service.dismiss_pending_batch(db, current_user.project_id, batch_id):
        raise HTTPException(status_code=404, detail="待回复提醒不存在或已结束")
    return {"ok": True, "batch_id": batch_id}


@router.get("/pending")
def pending(
    staff_id: Optional[UUID] = None,
    conversation_key: Optional[str] = None,
    platform_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    query = db.query(ReplyMonitorBatch).join(
        Platform, ReplyMonitorBatch.platform_id == Platform.id
    ).filter(
        ReplyMonitorBatch.project_id == current_user.project_id,
        ReplyMonitorBatch.status == "pending",
        Platform.type == "worktool",
    )
    if staff_id:
        query = query.filter(ReplyMonitorBatch.responsible_staff_id == staff_id)
    if conversation_key:
        query = query.filter(ReplyMonitorBatch.conversation_key == conversation_key)
    if platform_id:
        query = query.filter(ReplyMonitorBatch.platform_id == platform_id)
    rows = query.order_by(ReplyMonitorBatch.first_customer_at.asc()).all()
    monitor_settings = reply_monitor_service.get_or_create_settings(db, current_user.project_id)
    now = datetime.now(timezone.utc)
    result = []
    for row in rows:
        staff = db.get(Staff, row.responsible_staff_id) if row.responsible_staff_id else None
        ticket = db.get(Ticket, row.ticket_id) if row.ticket_id else None
        visitor = None
        if row.channel_open_id:
            visitor = db.query(Visitor).filter(
                Visitor.project_id == current_user.project_id,
                Visitor.platform_id == row.platform_id,
                Visitor.platform_open_id == row.channel_open_id,
                Visitor.deleted_at.is_(None),
            ).first()
        action_payload = WeComConversationActionRequest(
            platform_id=row.platform_id, conversation_key=row.conversation_key
        )
        binding, action_status, action_reason = _wecom_action_state(
            db, current_user, action_payload
        )
        reply_candidates = []
        if row.review_required:
            candidate_rows = db.query(ReplyMonitorEvent).filter(
                ReplyMonitorEvent.project_id == current_user.project_id,
                ReplyMonitorEvent.platform_id == row.platform_id,
                ReplyMonitorEvent.conversation_key == row.conversation_key,
                ReplyMonitorEvent.sender_kind == "staff",
                ReplyMonitorEvent.reply_match_status == "ambiguous",
                ReplyMonitorEvent.occurred_at >= row.first_customer_at,
            ).order_by(ReplyMonitorEvent.occurred_at.desc()).limit(10).all()
            reply_candidates = [{
                "event_id": candidate.id,
                "sender_name": candidate.sender_name,
                "content_summary": candidate.current_content or candidate.content_summary,
                "occurred_at": candidate.occurred_at,
            } for candidate in candidate_rows]
        result.append({"batch_id": row.id, "platform_id": row.platform_id, "conversation_key": row.conversation_key,
                       "channel_open_id": row.channel_open_id,
                       "channel_id": f"{visitor.id}-vtr" if visitor else None,
                       "conversation_type": row.conversation_type, "conversation_name": row.conversation_name,
                       "reply_status": row.status, "pending_reply_since": row.first_customer_at,
                       "pending_working_minutes": reply_monitor_service.working_minutes_between(
                           row.first_customer_at, now, monitor_settings
                       ),
                       "next_reminder_at": row.next_reminder_at,
                       "responsible_staff": ({"id": staff.id, "name": staff.name or staff.nickname or staff.username} if staff else None),
                       "reminder_count": row.reminder_count, "customer_message_count": row.customer_message_count,
                       "customer_identity_key": row.customer_identity_key,
                       "customer_sender_id": row.customer_sender_id,
                       "customer_sender_name": row.customer_sender_name,
                       "reply_match_status": row.reply_match_status,
                       "ambiguous_reason": (
                           "群内存在多个待回复客户，且客服消息未明确引用"
                           if row.review_required else None
                       ),
                       "reply_candidates": reply_candidates,
                       "ticket_id": row.ticket_id,
                       "ticket_number": ticket.number if ticket else None,
                       "wecom_action": action_status,
                       "can_dispatch_to_wecom": bool(binding and action_status == "available" and not action_reason),
                       "wecom_action_reason": action_reason})
    return result


@router.get(
    "/pending/{batch_id}/knowledge-suggestions",
    response_model=ReplyMonitorKnowledgeSuggestionResult,
)
async def pending_knowledge_suggestions(
    batch_id: UUID,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    """Retrieve read-only knowledge excerpts for a human agent; never sends a reply."""
    batch = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.id == batch_id,
        ReplyMonitorBatch.project_id == current_user.project_id,
        ReplyMonitorBatch.status == "pending",
    ).first()
    if batch is None:
        raise HTTPException(status_code=404, detail="待回复问题不存在")
    events = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.project_id == current_user.project_id,
        ReplyMonitorEvent.batch_id == batch.id,
        ReplyMonitorEvent.sender_kind == "customer",
    ).order_by(ReplyMonitorEvent.occurred_at.desc()).limit(5).all()
    parts = []
    for event in reversed(events):
        metadata = dict(event.event_metadata or {})
        value = (
            metadata.get("ocr_text")
            or event.current_content
            or event.normalized_content
            or event.content_summary
            or ""
        )
        value = " ".join(str(value).split())
        if value and value.casefold() not in {"[图片]", "【图片】", "[image]"}:
            parts.append(value)
    query = "；".join(dict.fromkeys(parts))[-1000:]
    if not query:
        return ReplyMonitorKnowledgeSuggestionResult(
            status="empty", query="", message="当前问题没有可用于检索的文字或 OCR 内容"
        )
    try:
        result = await get_knowledge_suggestions(
            project_id=current_user.project_id, query=query
        )
    except Exception:
        return ReplyMonitorKnowledgeSuggestionResult(
            status="unavailable",
            query=query,
            message="知识库服务暂时不可用，请稍后重试",
        )
    return ReplyMonitorKnowledgeSuggestionResult(
        status="ready" if result.items else "empty",
        query=result.query,
        collection_count=result.collection_count,
        items=[item.__dict__ for item in result.items],
        message=None if result.items else "知识库中暂未找到相关内容",
    )


@router.post("/pending/{batch_id}/resolve-reply-match")
def resolve_reply_match(
    batch_id: UUID,
    payload: ReplyMonitorReplyMatchReview,
    db: Session = Depends(get_db),
    current_user: Staff = Depends(get_current_active_user),
):
    _require_monitor_admin(current_user)
    batch = db.query(ReplyMonitorBatch).filter(
        ReplyMonitorBatch.id == batch_id,
        ReplyMonitorBatch.project_id == current_user.project_id,
        ReplyMonitorBatch.status == "pending",
    ).with_for_update().first()
    event = db.query(ReplyMonitorEvent).filter(
        ReplyMonitorEvent.id == payload.reply_event_id,
        ReplyMonitorEvent.project_id == current_user.project_id,
        ReplyMonitorEvent.sender_kind == "staff",
    ).first()
    if not batch or not event:
        raise HTTPException(status_code=404, detail="待回复问题或客服消息不存在")
    if (
        event.platform_id != batch.platform_id
        or event.conversation_key != batch.conversation_key
        or event.occurred_at < batch.first_customer_at
        or (event.batch_id and event.batch_id != batch.id)
    ):
        raise HTTPException(status_code=409, detail="客服消息与所选问题不属于同一会话或时间范围")
    staff = db.get(Staff, event.resolved_staff_id) if event.resolved_staff_id else None
    batch.status = "answered"
    batch.actual_reply_staff_id = staff.id if staff else None
    batch.actual_reply_name = event.sender_name
    batch.reply_actor_kind = "staff"
    batch.reply_match_status = "matched_manual"
    batch.review_required = False
    batch.first_reply_at = event.occurred_at
    batch.next_reminder_at = None
    event.batch_id = batch.id
    event.reply_actor_kind = "staff"
    event.reply_match_status = "matched_manual"
    from app.services.reply_monitor_ticket_service import ensure_answered_reply_monitor_ticket
    settings = reply_monitor_service.get_or_create_settings(db, current_user.project_id)
    ensure_answered_reply_monitor_ticket(db, batch, staff, event.occurred_at, settings.timezone)
    db.commit()
    return {"ok": True, "batch_id": batch.id, "reply_event_id": event.id, "reply_match_status": "matched_manual"}


@router.get("/stats")
def stats(start_date: date = Query(...), end_date: date = Query(...), staff_id: Optional[UUID] = None,
          responder_id: Optional[UUID] = None, conversation_key: Optional[str] = None, platform_id: Optional[UUID] = None,
          db: Session = Depends(get_db), current_user: Staff = Depends(get_current_active_user)):
    if start_date > end_date or (end_date - start_date).days > 366:
        raise HTTPException(status_code=400, detail="Invalid date range")
    allowed_platform_ids = [
        row[0]
        for row in db.query(Platform.id).filter(
            Platform.project_id == current_user.project_id,
            Platform.type == "worktool",
            Platform.deleted_at.is_(None),
        ).all()
    ]
    if platform_id and platform_id not in allowed_platform_ids:
        raise HTTPException(status_code=400, detail="platform_id must reference a WorkTool platform")
    return reply_monitor_service.build_stats(
        db, current_user.project_id, start_date, end_date,
        staff_id, conversation_key, platform_id, responder_id, allowed_platform_ids,
    )
