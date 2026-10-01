from __future__ import annotations
import httpx
from typing import AsyncIterator
from urllib.parse import quote

from app.domain.entities import ChatCompletionRequest
from app.domain.ports import TgoApiClient


class HttpxTgoApiClient(TgoApiClient):
    def __init__(self, base_url: str, timeout: float | None = None) -> None:
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    async def chat_completion(self, req: ChatCompletionRequest) -> AsyncIterator[bytes]:
        url = "/v1/chat/completion"
        async with self._client.stream("POST", url, json=req.model_dump()) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if line:
                    yield line.encode()

    async def create_public_ticket_link(
        self, *, platform_api_key: str, group_key: str | None = None
    ) -> str:
        response = await self._client.post(
            "/v1/public-tickets/links",
            headers={"X-Platform-API-Key": platform_api_key},
            json={"group_key": group_key, "expires_in_seconds": 86400},
        )
        response.raise_for_status()
        return str(response.json().get("url") or "")

    async def record_reply_monitor_event(self, *, platform_api_key: str, payload: dict) -> dict:
        response = await self._client.post(
            "/v1/reply-monitor/events",
            headers={"X-Platform-API-Key": platform_api_key},
            json=payload,
        )
        response.raise_for_status()
        return response.json()

    async def bind_reply_monitor_owner_chat(
        self, *, platform_api_key: str, message_id: str, visitor_id: str
    ) -> dict:
        response = await self._client.post(
            f"/v1/reply-monitor/events/{quote(message_id, safe='')}/owner-chat",
            headers={"X-Platform-API-Key": platform_api_key},
            json={"visitor_id": visitor_id},
        )
        response.raise_for_status()
        return response.json()

    async def record_reply_monitor_media(
        self,
        *,
        platform_api_key: str,
        message_id: str,
        filename: str,
        content_type: str,
        content: bytes,
        capture_source: str = "cache",
    ) -> dict:
        response = await self._client.post(
            f"/v1/reply-monitor/events/{quote(message_id, safe='')}/media",
            headers={"X-Platform-API-Key": platform_api_key},
            files={"file": (filename, content, content_type)},
            data={"capture_source": capture_source},
        )
        response.raise_for_status()
        return response.json()

    async def aclose(self) -> None:
        await self._client.aclose()
