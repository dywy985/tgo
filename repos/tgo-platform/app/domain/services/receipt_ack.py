from __future__ import annotations

import asyncio
import time
from typing import Any, Protocol

DEFAULT_RECEIPT_TEXT = "您好，您的消息已收到，正在为您查询处理，请稍候。"
DEFAULT_COOLDOWN_SECONDS = 45


class ReceiptAckClaimStore(Protocol):
    async def claim(
        self,
        *,
        platform_id: str,
        message_id: str,
        conversation_id: str,
        cooldown_seconds: int,
    ) -> str: ...

    async def release(
        self,
        *,
        platform_id: str,
        message_id: str,
        conversation_id: str,
    ) -> None: ...


class ReceiptAckAdapter(Protocol):
    async def send_final(self, content: dict[str, Any]) -> None: ...


class InMemoryReceiptAckClaimStore:
    """Process-local fallback used when Redis is not configured or is unavailable."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._messages: dict[str, float] = {}
        self._conversations: dict[str, float] = {}

    async def claim(
        self,
        *,
        platform_id: str,
        message_id: str,
        conversation_id: str,
        cooldown_seconds: int,
    ) -> str:
        message_key = f"{platform_id}:{message_id}"
        conversation_key = f"{platform_id}:{conversation_id}"
        now = time.monotonic()
        async with self._lock:
            if self._messages.get(message_key, 0) > now:
                return "duplicate"
            self._messages[message_key] = now + 7 * 24 * 60 * 60
            if self._conversations.get(conversation_key, 0) > now:
                return "cooldown"
            self._conversations[conversation_key] = now + cooldown_seconds
            if len(self._messages) > 10_000:
                self._messages = {key: expiry for key, expiry in self._messages.items() if expiry > now}
            return "send"

    async def release(
        self,
        *,
        platform_id: str,
        message_id: str,
        conversation_id: str,
    ) -> None:
        async with self._lock:
            self._messages.pop(f"{platform_id}:{message_id}", None)
            self._conversations.pop(f"{platform_id}:{conversation_id}", None)


class ReceiptAckService:
    """Send a fast channel receipt while keeping it separate from the AI reply."""

    def __init__(self, claim_store: ReceiptAckClaimStore) -> None:
        self._claim_store = claim_store

    async def send_if_due(
        self,
        *,
        adapter: ReceiptAckAdapter,
        platform_id: str,
        message_id: str,
        conversation_id: str,
        platform_config: dict[str, Any] | None,
        is_from_colleague: bool,
        source_type: str,
        msg_type: str,
    ) -> str:
        config = (platform_config or {}).get("receipt_ack") or {}
        if config.get("enabled", True) is False or is_from_colleague:
            return "ineligible"

        cooldown_seconds = int(config.get("cooldown_seconds") or DEFAULT_COOLDOWN_SECONDS)
        cooldown_seconds = max(10, min(cooldown_seconds, 300))
        claim_result = await self._claim_store.claim(
            platform_id=platform_id,
            message_id=message_id,
            conversation_id=conversation_id,
            cooldown_seconds=cooldown_seconds,
        )
        if claim_result != "send":
            return claim_result

        text = str(config.get("text") or DEFAULT_RECEIPT_TEXT).strip()
        if not text:
            await self._claim_store.release(
                platform_id=platform_id,
                message_id=message_id,
                conversation_id=conversation_id,
            )
            return "ineligible"

        try:
            await adapter.send_final({"text": text})
        except Exception:
            await self._claim_store.release(
                platform_id=platform_id,
                message_id=message_id,
                conversation_id=conversation_id,
            )
            raise
        return "sent"
