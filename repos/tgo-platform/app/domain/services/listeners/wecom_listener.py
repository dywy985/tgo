from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.db.models import Platform, WeComInbox
from app.domain.entities import NormalizedMessage

# 转人工关键词 (默认; 平台配置 trigger.manual_service_kw 可覆盖)
_MANUAL_SERVICE_KW = ["转人工", "人工客服", "找人工", "人工服务", "转接人工", "真人客服", "我要人工", "人工处理", "联系人工"]

# 评分词库 (默认; 平台配置 trigger.business_kw/question_kw/chat_kw 可覆盖)
_BUSINESS_KW = ["激活", "授权", "激活码", "工单", "价格", "多少钱", "购买", "买", "售后", "退货",
                "换货", "物流", "快递", "发票", "客服", "人工", "怎么用", "如何使用", "故障", "报错",
                "错误", "登录", "账号", "密码", "K6K8", "k6k8", "安装", "下载", "升级", "版本",
                "到期", "续费", "退款", "套餐", "报价", "试用"]
_QUESTION_KW = ["怎么", "如何", "请问", "为什么", "能不能", "有没有", "多少", "哪里", "什么", "能否", "是否"]
_CHAT_KW = ["哈哈", "哈哈哈", "早上好", "晚上好", "中午好", "晚安", "收到", "在吗", "嗯嗯", "好的", "谢谢", "感谢", "哦"]


def _score_content(content: str, cfg: dict | None = None) -> int:
    """规则评分 0-100: 业务词/提问词加分, 闲聊/超短消息减分. 词库来自平台配置 trigger 段, 缺省用内置默认. """
    cfg = cfg or {}
    business = cfg.get("business_kw") or _BUSINESS_KW
    question = cfg.get("question_kw") or _QUESTION_KW
    chat = cfg.get("chat_kw") or _CHAT_KW
    s = 0
    if not content:
        return 0
    if any(kw in content for kw in business):
        s += 60
    if any(kw in content for kw in question):
        s += 20
    if content.rstrip().endswith(("？", "?")):
        s += 10
    if any(kw in content for kw in chat):
        s -= 50
    if len(content) >= 4:
        s += 10
    elif len(content) <= 2:
        s -= 40
    return max(0, min(100, s))


def _is_manual_service_request(content: str, cfg: dict | None = None) -> bool:
    """转人工关键词检测 (不依赖 AI). 关键词来自平台配置 trigger.manual_service_kw, 缺省用内置默认. """
    cfg = cfg or {}
    kws = cfg.get("manual_service_kw") or _MANUAL_SERVICE_KW
    return any(kw in content for kw in kws)
from app.domain.ports import MessageNormalizer, TgoApiClient, SSEManager
from app.domain.services.dispatcher import process_message
from app.infra.visitor_client import VisitorService
from app.api.wecom_utils import get_wecom_visitor_profile


class WeComPlatformConfig(BaseModel):
    """Per-platform WeCom configuration stored in Platform.config when type='wecom'."""

    corp_id: str = ""     # 企业ID (required for wecom_kf, optional for wecom_bot)
    agent_id: str = ""    # 应用ID (required for wecom_kf, optional for wecom_bot)
    app_secret: str = ""  # 应用密钥 (required for wecom_kf, optional for wecom_bot)
    token: str = ""       # 回调签名 Token
    encoding_aes_key: str | None = None  # 消息加密密钥（可选）

    # Consumer processing configuration
    processing_batch_size: int = 10
    max_retry_attempts: int = 3
    consumer_poll_interval_seconds: int = 5


@dataclass
class _PlatformEntry:
    id: uuid.UUID
    project_id: uuid.UUID
    api_key: str | None
    cfg: WeComPlatformConfig
    platform_type: str  # "wecom" (KF) or "wecom_bot"
    config: dict | None = None  # 原始 config JSONB (触发配置等)


# 企微 msg_type 字符串 -> TGO MessageType 整数 (1=text, 2=image, 3=file, 4=voice, 5=video)
_WECOM_MSG_TYPE_MAP = {
    "text": 1, "image": 2, "file": 3, "voice": 4, "video": 5,
}


def _to_msg_type_int(raw) -> int:
    if isinstance(raw, int):
        return raw
    return _WECOM_MSG_TYPE_MAP.get(str(raw or "").lower(), 1)


def _should_trigger(source_type: str, rec, trigger_cfg: dict | None) -> tuple[bool, str]:
    """消息是否触发 AI 回答. 返回 (是否触发, 原因)。

    触发配置 (platform.config.trigger):
      mode: hybrid(默认, @必回+高分自动回) / mention(仅@回) / auto(纯评分) / disabled(关闭)
      score_threshold: 评分阈值 (默认 60)
      llm_prefilter: 模糊区是否走 LLM 预判 (默认 false)
      ignore_members: 忽略成员名单 (发送者名命中不触发)
    """
    if source_type not in ("wecom_reader", "worktool", "wecom_bot"):
        return True, "other_platform"
    try:
        raw = rec.raw_payload or {}
    except Exception:
        raw = {}
    parsed = raw.get("parsed") or {}
    # 私聊(一对一咨询)直接触发 AI: 语义明确, 无需评分过滤 (room_type: 3=群聊, 4=私聊)
    room_type = raw.get("room_type") or parsed.get("room_type")
    if room_type in (1, 4, "1", "4"):
        return True, f"private_chat:{room_type}"
    tc = trigger_cfg or {}
    mode = str(tc.get("mode") or "hybrid").lower()
    threshold = int(tc.get("score_threshold") or 60)
    # score/is_mention/sender_name 兼容双层结构: raw 顶层或 raw["parsed"] (wecom_reader/worktool 桥接)
    payload_score = int(raw.get("score") or parsed.get("score") or 0)
    # 评分系统: 平台配置词库对消息内容评分 (可配置), 与 payload score 取高 (兼容 AI 评分平台)
    content = str(getattr(rec, "content", None) or "")
    score = max(_score_content(content, tc), payload_score)
    is_mention = bool(raw.get("is_mention") or parsed.get("is_mention"))
    sender_name = str(raw.get("sender_name") or parsed.get("sender_name") or "")

    # 忽略成员名单
    ignored = [str(x).strip() for x in (tc.get("ignore_members") or []) if str(x).strip()]
    if ignored and sender_name and sender_name in ignored:
        return False, "ignored_member"

    if is_mention:
        return True, "mention"
    if mode == "mention":
        return False, "mention_only"
    if mode == "disabled":
        return False, "disabled"
    if score >= threshold:
        return True, f"score:{score}"
    if score < 30:
        return False, f"score:{score}"
    # 模糊区 (30 <= score < threshold): llm_prefilter 开启时交给 LLM 预判 (后续实现)
    if tc.get("llm_prefilter"):
        return True, f"llm_prefilter:{score}"
    return False, f"score:{score}"


class WeComChannelListener:
    """WeCom consumer that processes pending wecom_inbox rows asynchronously.

    Producer: FastAPI callback endpoint stores messages into wecom_inbox.
    Consumer: this listener queries pending rows and processes them via dispatcher.
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        normalizer: MessageNormalizer,
        tgo_api_client: TgoApiClient,
        sse_manager: SSEManager,
    ) -> None:
        self._session_factory = session_factory
        self._normalizer = normalizer
        self._tgo_api_client = tgo_api_client
        self._sse_manager = sse_manager
        self._stop_event = asyncio.Event()
        self._consumer_task: asyncio.Task | None = None
        self._visitor_service = VisitorService(
            base_url=settings.api_base_url,
            cache_ttl_seconds=300,
            redis_url=settings.redis_url,
        )

    async def start(self) -> None:
        if self._consumer_task is None or self._consumer_task.done():
            self._consumer_task = asyncio.create_task(self._consumer_loop())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._consumer_task:
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except asyncio.CancelledError:
                pass

    async def _load_active_wecom_platforms(self) -> list[_PlatformEntry]:
        """Load all active WeCom platforms (wecom_kf / wecom_bot / wecom_reader / worktool types)."""
        async with self._session_factory() as session:
            rows = (
                await session.execute(
                    select(Platform.id, Platform.project_id, Platform.api_key, Platform.config, Platform.type)
                    .where(Platform.is_active.is_(True), Platform.type.in_(["wecom", "wecom_bot", "wecom_bot_api", "wecom_reader", "worktool"]))
                )
            ).all()
        platforms: list[_PlatformEntry] = []
        for pid, project_id, api_key, cfg_dict, platform_type in rows:
            try:
                cfg = WeComPlatformConfig(**(cfg_dict or {}))
                platforms.append(_PlatformEntry(
                    id=pid,
                    project_id=project_id,
                    api_key=api_key,
                    cfg=cfg,
                    platform_type=platform_type or "wecom",
                    config=cfg_dict or {},
                ))
            except Exception as e:
                print(f"[WECOM] Skip platform {pid}: invalid config: {e}")
        return platforms

    async def _consumer_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                platforms = await self._load_active_wecom_platforms()
                for p in platforms:
                    try:
                        await self._process_pending_for_platform(p)
                    except Exception as e:
                        print(f"[WECOM] Consumer error for platform {p.id}: {e}")
                # Sleep using first platform's interval or default
                interval = platforms[0].cfg.consumer_poll_interval_seconds if platforms else 5
                await asyncio.sleep(max(1, int(interval)))
            except Exception as e:
                print(f"[WECOM] Consumer supervisor error: {e}")
                await asyncio.sleep(5)


    # ---- Internal helper methods (refactor for clarity and reuse) ----
    async def _select_candidates(
        self,
        session: AsyncSession,
        platform: _PlatformEntry,
        batch_size: int,
        max_retries: int,
    ) -> list[WeComInbox]:
        """Select a batch of candidate records to process for the given platform.

        Strategy:
        - Fetch 'pending' first (oldest fetched_at first), FOR UPDATE SKIP LOCKED
        - If under-filled, add eligible 'failed' with exponential backoff, SKIP LOCKED
        """
        # Pending first
        pending = (
            await session.execute(
                select(WeComInbox)
                .where(WeComInbox.platform_id == platform.id, WeComInbox.status == "pending")
                .order_by(WeComInbox.fetched_at.asc())
                .with_for_update(skip_locked=True)
                .limit(batch_size)
            )
        ).scalars().all()

        remaining = batch_size - len(pending)
        candidates: list[WeComInbox] = list(pending)

        if remaining > 0:
            failed = (
                await session.execute(
                    select(WeComInbox)
                    .where(
                        WeComInbox.platform_id == platform.id,
                        WeComInbox.status == "failed",
                        WeComInbox.retry_count < max_retries,
                    )
                    .order_by(WeComInbox.processed_at.asc().nullsfirst())
                    .with_for_update(skip_locked=True)
                    .limit(batch_size * 3)
                )
            ).scalars().all()
            now = datetime.now(timezone.utc)
            for record in failed:
                delay = max(1, 2 ** int(record.retry_count or 0))
                if not record.processed_at or (now - record.processed_at).total_seconds() >= delay:
                    candidates.append(record)
                    if len(candidates) >= batch_size:
                        break

        return candidates

    async def _claim_record(self, session: AsyncSession, record: WeComInbox) -> bool:
        """Attempt to mark a record as processing. Returns True if claimed successfully."""
        try:
            record.status = "processing"
            record.error_message = None
            await session.commit()
            return True
        except Exception as e:
            print(f"[WECOM] Claiming record failed (skip): {e}")
            await session.rollback()
            return False

    def _build_mapped_message(self, platform: _PlatformEntry, record: WeComInbox) -> dict[str, Any]:
        """Build the NormalizedMessage-like raw dict for downstream normalization."""
        # Determine source_type from record or fallback to platform_type
        source_type = getattr(record, "source_type", None) or ("wecom_bot" if platform.platform_type == "wecom_bot" else "wecom_kf")

        # Build WeCom-specific context used by adapter selection/sending
        wecom_ctx: dict[str, Any] = {
            "is_from_colleague": bool(record.is_from_colleague),
            "source_type": source_type,
        }

        if source_type == "wecom_kf":
            # WeCom Customer Service specific context
            try:
                raw_payload = record.raw_payload or {}
                # KF sync messages embed original msg at raw_payload["kf_sync_msg"], which includes open_kfid/external_userid
                kf_msg = raw_payload.get("kf_sync_msg") or {}
                open_kfid = kf_msg.get("open_kfid") or raw_payload.get("open_kfid") or record.open_kfid
                if open_kfid:
                    wecom_ctx["open_kfid"] = open_kfid
            except Exception:
                pass
            # external_userid is needed for KF send; extract via helper
            try:
                wecom_ctx["external_userid"] = self._extract_external_user_id(record)
            except Exception:
                pass
        elif source_type == "wecom_reader":
            # 本地监控桥 specific context: chatid (aibot 推送目标) + 群名/发送人
            try:
                raw_payload = record.raw_payload or {}
                wecom_ctx["chat_id"] = raw_payload.get("chat_id") or record.open_kfid or ""
                wecom_ctx["conv_name"] = raw_payload.get("conv_name") or ""
                wecom_ctx["sender_name"] = raw_payload.get("sender_name") or ""
                wecom_ctx["sender_id"] = raw_payload.get("sender_id")
            except Exception:
                pass
        else:
            # WeCom Bot specific context
            try:
                raw_payload = record.raw_payload or {}
                wecom_ctx["chat_id"] = raw_payload.get("chat_id") or record.open_kfid or ""
                wecom_ctx["chat_type"] = raw_payload.get("chat_type") or ""
                wecom_ctx["aibot_id"] = raw_payload.get("aibot_id") or ""
                # response_url is required for replying to wecom_bot messages
                wecom_ctx["response_url"] = raw_payload.get("response_url") or ""
            except Exception:
                pass

        return {
            "source": "wecom",
            "from_uid": record.from_user,
            "content": record.content or "",
            "platform_api_key": platform.api_key or "",
            "platform_type": platform.platform_type,  # "wecom", "wecom_bot" or "wecom_reader"
            "platform_id": str(platform.id),
            "extra": {
                "project_id": str(platform.project_id),
                "msg_type": _to_msg_type_int(record.msg_type),
                "source_type": source_type,  # "wecom_kf", "wecom_bot" or "wecom_reader"
                "wecom": wecom_ctx,
                "wecom_reader": {
                    "chatid": wecom_ctx.get("chat_id") or "",
                    "conv_name": wecom_ctx.get("conv_name") or "",
                    "sender_name": wecom_ctx.get("sender_name") or "",
                },
            },
        }

    def _extract_external_user_id(self, record: WeComInbox) -> str:
        """Extract external_userid if present in raw_payload; fallback to from_user."""
        try:
            raw_payload = record.raw_payload or {}
            parsed = raw_payload.get("parsed") or {}
            return (
                parsed.get("ExternalUserID")
                or raw_payload.get("external_userid")
                or record.from_user
            )
        except Exception:
            return record.from_user

    async def _fetch_visitor_profile_cached(
        self,
        platform: _PlatformEntry,
        record: WeComInbox,
        external_user_id: str,
    ) -> tuple[str | None, str | None]:
        """Cache-first retrieval of visitor profile; calls WeCom APIs on cache miss."""
        display_name: str | None = None
        avatar_url: str | None = None
        try:
            cache_key = self._visitor_service.make_cache_key(str(platform.project_id), "wecom", record.from_user)
            cached = await self._visitor_service.get_cached(cache_key)
            if cached:
                display_name = cached.nickname or cached.name
                avatar_url = cached.avatar_url
            else:
                profile = await get_wecom_visitor_profile(
                    corp_id=platform.cfg.corp_id,
                    app_secret=platform.cfg.app_secret,
                    external_userid=external_user_id,
                )
                display_name = (profile or {}).get("nickname")
                avatar_url = (profile or {}).get("avatar")
        except Exception as e:
            print(f"[WECOM] Fetch visitor profile failed for {external_user_id}: {e}")
        return display_name, avatar_url

    def _attach_profile_to_extra(self, mapped_raw: dict[str, Any], display_name: str | None, avatar_url: str | None) -> None:
        """Attach visitor profile fields into mapped_raw.extra.visitor_profile safely."""
        try:
            extra = mapped_raw.get("extra") or {}
            extra["visitor_profile"] = {"nickname": display_name, "avatar_url": avatar_url}
            mapped_raw["extra"] = extra
        except Exception:
            pass

    async def _register_visitor(
        self,
        platform: _PlatformEntry,
        record: WeComInbox,
        display_name: str | None,
        avatar_url: str | None,
    ):
        """Register or get visitor through tgo-api, using cache in VisitorService."""
        if not platform.api_key:
            return None
        try:
            return await self._visitor_service.register_or_get(
                platform_api_key=platform.api_key,
                project_id=str(platform.project_id),
                platform_type="wecom",
                platform_open_id=record.from_user,
                nickname=display_name,
                avatar_url=avatar_url,
            )
        except Exception as e:
            print(f"[WECOM] Visitor registration failed for {platform.id}: {e}")
            return None

    async def _sync_inbound_to_wukongim(self, p: "_PlatformEntry", record: WeComInbox, visitor: Any) -> None:
        """客户消息同步到 WuKongIM 频道 (visitor-vtr): 保证 /chat 对话页能看到客户消息.

        AI 是否回复由评分触发判定决定, 但消息本身始终可见 (接收消息但不回复).
        同步失败不阻塞主流程.
        """
        try:
            content = str(getattr(record, "content", None) or "").strip()
            if not content:
                return
            import base64 as _b64
            import json as _json
            import httpx as _httpx
            base = getattr(settings, "wukongim_service_url", None) or "http://wukongim:5001"
            base = str(base).rstrip("/")
            payload_encoded = _b64.b64encode(
                _json.dumps({"type": 1, "content": content}, ensure_ascii=False).encode("utf-8")
            ).decode("utf-8")
            body = {
                "payload": payload_encoded,
                "from_uid": str(visitor.id),
                "channel_id": f"{visitor.id}-vtr",
                "channel_type": 251,
                "client_msg_no": f"inbound_{uuid.uuid4().hex}",
            }
            async with _httpx.AsyncClient(timeout=5) as client:
                resp = await client.post(f"{base}/message/send", json=body)
                if resp.status_code != 200:
                    print(f"[WECOM] wk sync inbound failed: {resp.status_code} {resp.text[:80]}")
        except Exception as e:
            print(f"[WECOM] wk sync inbound error: {e}")

    async def _trigger_manual_service(self, p: "_PlatformEntry", record: WeComInbox, visitor: Any) -> None:
        """关键词命中转人工: POST tgo-api 内部事件端点 (manual_service.request), 触发标签/停AI/分配/建单. """
        try:
            import httpx
            raw = record.raw_payload or {}
            parsed = raw.get("parsed") or {}
            content = str(record.content or parsed.get("content") or "")
            reason = "客户在群里要求人工服务: %s" % (content[:50] if content else "转人工")
            body = {
                "event_type": "manual_service.request",
                "user_id": str(visitor.id),
                "payload": {"reason": reason, "urgency": "normal"},
            }
            base = settings.api_internal_base_url.rstrip("/")
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(f"{base}/internal/ai/events", json=body)
                resp.raise_for_status()
            print(f"[WECOM] Manual service triggered for visitor {visitor.id}: {reason}")
        except Exception as e:
            print(f"[WECOM] Manual service trigger failed for visitor {visitor.id}: {e}")

    async def _finalize_success(self, session: AsyncSession, record: WeComInbox, reply_text: str | None) -> None:
        """Mark record as completed with optional reply text."""
        record.ai_reply = reply_text
        record.status = "completed"
        record.processed_at = datetime.now(timezone.utc)
        record.error_message = None
        try:
            await session.commit()
        except Exception as e2:
            print(f"[WECOM] Commit completed status failed (ignore): {e2}")
            await session.rollback()

    async def _finalize_failure(self, session: AsyncSession, platform: _PlatformEntry, record: WeComInbox, error: Exception) -> None:
        """Mark record as failed with retry increment and error message, preserving logs."""
        print(f"[WECOM] Processing failed for {platform.id}: {error}")
        record.status = "failed"
        record.processed_at = datetime.now(timezone.utc)
        record.retry_count = int((record.retry_count or 0)) + 1
        record.error_message = str(error)[:2000]
        try:
            await session.commit()
        except Exception as e2:
            print(f"[WECOM] Commit failed status failed (ignore): {e2}")
            await session.rollback()

    async def _get_or_register_visitor(
        self,
        platform: _PlatformEntry,
        record: WeComInbox,
    ) -> tuple[Any | None, str | None, str | None]:
        """End-to-end flow for visitor retrieval/registration with minimal calls.

        Steps:
        1) Check VisitorService cache; if exists, return immediately (skip external calls)
        2) Else, fetch profile from WeCom (if possible, only for wecom_kf) to enrich nickname/avatar
        3) Register or get visitor via tgo-api using nickname/avatar; return result
        """
        display_name: str | None = None
        avatar_url: str | None = None
        visitor = None

        # Determine source type for platform-specific handling
        source_type = getattr(record, "source_type", None) or ("wecom_bot" if platform.platform_type == "wecom_bot" else "wecom_kf")
        platform_type_for_visitor = platform.platform_type  # "wecom" or "wecom_bot"

        try:
            cache_key = self._visitor_service.make_cache_key(str(platform.project_id), platform_type_for_visitor, record.from_user)
            cached = await self._visitor_service.get_cached(cache_key)
            if cached:
                display_name = cached.nickname or cached.name
                avatar_url = cached.avatar_url
                return cached, display_name, avatar_url
        except Exception as e:
            # Cache access errors shouldn't stop processing
            print(f"[WECOM] Visitor cache lookup failed for {platform.id}: {e}")

        # Cache miss: try to fetch profile from WeCom to enrich registration
        # Only for wecom_kf (customer service) - wecom_bot doesn't have external contact APIs
        if source_type == "wecom_kf" and platform.cfg.corp_id and platform.cfg.app_secret:
            external_user_id = self._extract_external_user_id(record)
            try:
                profile = await get_wecom_visitor_profile(
                    corp_id=platform.cfg.corp_id,
                    app_secret=platform.cfg.app_secret,
                    external_userid=external_user_id,
                )
                display_name = (profile or {}).get("nickname")
                avatar_url = (profile or {}).get("avatar")
            except Exception as e:
                print(f"[WECOM] Fetch visitor profile failed for {external_user_id}: {e}")
        elif source_type == "wecom_bot":
            # For wecom_bot, try to extract name from raw_payload
            try:
                raw_payload = record.raw_payload or {}
                parsed = raw_payload.get("parsed") or {}
                from_info = parsed.get("from") or {}
                if isinstance(from_info, dict):
                    display_name = from_info.get("name") or from_info.get("alias") or from_info.get("userid")
            except Exception:
                pass
        elif source_type in ("wecom_reader", "worktool"):
            # 本地监控桥 / worktool 桥: 访客昵称用群名 (按群聚合), 无则退回会话 ID
            try:
                raw_payload = record.raw_payload or {}
                display_name = raw_payload.get("conv_name") or record.from_user
            except Exception:
                display_name = record.from_user

        if platform.api_key:
            try:
                visitor = await self._visitor_service.register_or_get(
                    platform_api_key=platform.api_key,
                    project_id=str(platform.project_id),
                    platform_type=platform_type_for_visitor,
                    platform_open_id=record.from_user,
                    nickname=display_name,
                    avatar_url=avatar_url,
                )
            except Exception as e:
                print(f"[WECOM] Visitor registration failed for {platform.id}: {e}")
        return visitor, display_name, avatar_url


    async def _process_pending_for_platform(self, p: _PlatformEntry) -> None:
        batch_size = max(1, int(getattr(p.cfg, "processing_batch_size", 10) or 10))
        max_retries = max(0, int(getattr(p.cfg, "max_retry_attempts", 3) or 3))

        async with self._session_factory() as db:
            # Select candidate records for this platform (pending + eligible failed)
            candidates: list[WeComInbox] = await self._select_candidates(db, p, batch_size, max_retries)
            if not candidates:
                return

            for rec in candidates:
                # Claim record for processing
                if not await self._claim_record(db, rec):
                    continue

                source_type = getattr(rec, "source_type", None) or p.platform_type or ""

                try:
                    # Build mapped message
                    mapped_raw: dict[str, Any] = self._build_mapped_message(p, rec)

                    # Unified visitor retrieval/registration with cache-first + optional profile
                    # 任何消息都注册 visitor (不依赖评分触发): 保证每个企微群在 /chat 都有会话,
                    # 评分不触发 AI 时人工仍可看到并接管
                    visitor, display_name, avatar_url = await self._get_or_register_visitor(p, rec)
                    self._attach_profile_to_extra(mapped_raw, display_name, avatar_url)

                    # 客户消息同步到 WuKongIM: /chat 页始终可见客户消息 (评分不触发 AI 时只是不回复)
                    await self._sync_inbound_to_wukongim(p, rec, visitor)

                    # 智能触发判定 (hybrid/@必回/评分阈值), 不触发则完成入库但不调 AI
                    trigger_on, trigger_reason = _should_trigger(
                        source_type, rec, (p.config or {}).get("trigger"))
                    if not trigger_on:
                        await self._finalize_success(db, rec, None)
                        continue

                    # ============ 转人工关键词兜底 (不依赖 AI 判定, AI 关闭时也能转人工) ============
                    if visitor and _is_manual_service_request(
                            str(getattr(rec, "content", None) or ""), (p.config or {}).get("trigger")):
                        await self._trigger_manual_service(p, rec, visitor)
                        await self._finalize_success(db, rec, None)
                        continue

                    # Normalize and process
                    msg: NormalizedMessage = await self._normalizer.normalize(mapped_raw)
                    reply_text = await process_message(
                        msg=msg,
                        db=db,
                        tgo_api_client=self._tgo_api_client,
                        sse_manager=self._sse_manager,
                    )

                    # Finalize success
                    await self._finalize_success(db, rec, reply_text)
                except Exception as e:
                    # Finalize failure with retry increment
                    await self._finalize_failure(db, p, rec, e)
