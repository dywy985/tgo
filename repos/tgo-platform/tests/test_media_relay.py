import asyncio
import os
from types import SimpleNamespace

os.environ.setdefault("API_BASE_URL", "http://tgo-api:8001")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")

from app.api.v1.callbacks import _callback_token_valid
from app.infra.http import HttpxTgoApiClient
from app.domain.services.monitoring import (
    monitor_event_should_sync_as_customer,
    monitor_event_should_sync_to_owner_chat,
)


class _Response:
    def raise_for_status(self):
        return None

    def json(self):
        return {"media": {"id": "media-1"}, "duplicate": False}


class _Client:
    def __init__(self):
        self.calls = []

    async def post(self, path, **kwargs):
        self.calls.append((path, kwargs))
        return _Response()


def test_platform_media_relay_preserves_auth_and_message_id():
    api = object.__new__(HttpxTgoApiClient)
    api._client = _Client()

    result = asyncio.run(
        api.record_reply_monitor_media(
            platform_api_key="platform-key",
            message_id="message-1",
            filename="shot.png",
            content_type="image/png",
            content=b"png",
        )
    )

    path, kwargs = api._client.calls[0]
    assert path == "/v1/reply-monitor/events/message-1/media"
    assert kwargs["headers"] == {"X-Platform-API-Key": "platform-key"}
    assert kwargs["files"]["file"] == ("shot.png", b"png", "image/png")
    assert result["media"]["id"] == "media-1"


def test_media_callback_token_uses_constant_time_comparison():
    platform = SimpleNamespace(config={"token": "callback-secret"})

    assert _callback_token_valid(platform, "callback-secret") is True
    assert _callback_token_valid(platform, "wrong") is False
    assert _callback_token_valid(SimpleNamespace(config={}), "") is True


def test_platform_uses_api_effective_sender_kind_before_syncing_customer_chat():
    assert monitor_event_should_sync_as_customer(
        {"effective_sender_kind": "customer"}, "staff"
    ) is True
    assert monitor_event_should_sync_as_customer(
        {"effective_sender_kind": "staff"}, "customer"
    ) is False
    assert monitor_event_should_sync_as_customer({}, "customer") is True


def test_every_group_message_syncs_to_the_owner_chat():
    for sender_kind in ("customer", "staff", "unknown"):
        assert monitor_event_should_sync_to_owner_chat(
            {"effective_sender_kind": sender_kind}, sender_kind, "group"
        ) is True

    assert monitor_event_should_sync_to_owner_chat(
        {"effective_sender_kind": "unknown"}, "unknown", "private"
    ) is False


def test_platform_can_bind_monitor_event_owner_to_visitor_chat():
    api = object.__new__(HttpxTgoApiClient)
    api._client = _Client()

    result = asyncio.run(
        api.bind_reply_monitor_owner_chat(
            platform_api_key="platform-key",
            message_id="message-1",
            visitor_id="visitor-1",
        )
    )

    path, kwargs = api._client.calls[0]
    assert path == "/v1/reply-monitor/events/message-1/owner-chat"
    assert kwargs["headers"] == {"X-Platform-API-Key": "platform-key"}
    assert kwargs["json"] == {"visitor_id": "visitor-1"}
    assert result["media"]["id"] == "media-1"
