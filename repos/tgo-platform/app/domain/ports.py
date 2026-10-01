from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Protocol, AsyncIterator

from app.domain.entities import NormalizedMessage, ChatCompletionRequest, StreamEvent


class ChannelListener(Protocol):
    async def listen(self) -> AsyncIterator[dict]:
        """Yield raw inbound message events asynchronously."""


class MessageNormalizer(Protocol):
    async def normalize(self, raw: dict) -> NormalizedMessage: ...


class TgoApiClient(Protocol):
    async def chat_completion(self, req: ChatCompletionRequest) -> AsyncIterator[bytes]:
        """Open SSE stream by POSTing to tgo-api and yield raw event lines as bytes."""

    async def create_public_ticket_link(
        self, *, platform_api_key: str, group_key: str | None = None
    ) -> str:
        """Create a customer-facing ticket form URL."""

    async def record_reply_monitor_event(self, *, platform_api_key: str, payload: dict) -> dict:
        """Idempotently record one customer/staff message for human monitoring."""

    async def bind_reply_monitor_owner_chat(
        self, *, platform_api_key: str, message_id: str, visitor_id: str
    ) -> dict:
        """Attach the event's resolved owner to the corresponding visitor chat."""

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
        """Attach one sanitized-on-receipt image to a monitor event."""


class SSEManager(Protocol):
    async def stream_events(self, frames: AsyncIterator[bytes]) -> AsyncIterator[StreamEvent]: ...
    async def aggregate(self, events: AsyncIterator[StreamEvent]) -> dict: ...


class PlatformAdapter(ABC):
    supports_stream: bool = False

    @abstractmethod
    async def send_incremental(self, ev: StreamEvent) -> None: ...

    @abstractmethod
    async def send_final(self, content: dict) -> None: ...
