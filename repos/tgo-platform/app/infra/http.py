from __future__ import annotations
import httpx
from typing import AsyncIterator

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

    async def aclose(self) -> None:
        await self._client.aclose()
