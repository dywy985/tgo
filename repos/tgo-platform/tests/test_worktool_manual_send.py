import json
import importlib.util
import os
import sys
import base64
from types import ModuleType
from types import SimpleNamespace

import httpx
import pytest
from starlette.requests import Request

os.environ.setdefault("API_BASE_URL", "http://tgo-api:8000")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/test")
if importlib.util.find_spec("slack_sdk") is None:
    slack_sdk = ModuleType("slack_sdk")
    slack_sdk.WebClient = object
    slack_errors = ModuleType("slack_sdk.errors")
    slack_errors.SlackApiError = RuntimeError
    sys.modules.setdefault("slack_sdk", slack_sdk)
    sys.modules.setdefault("slack_sdk.errors", slack_errors)

from app.api.v1 import messages


class _Db:
    def __init__(self, platform):
        self.platform = platform

    async def scalar(self, _statement):
        return self.platform


class _GatewayResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {"status": "queued", "send_id": "send-1"}


@pytest.mark.asyncio
async def test_manual_worktool_send_authenticates_and_is_idempotent(monkeypatch):
    captured = {}

    async def _confirmed(*_args, **_kwargs):
        return {"status": "success"}
    monkeypatch.setattr(messages, "_wait_worktool_result", _confirmed)

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, *, json, headers=None):
            captured.update(url=url, json=json, headers=headers or {})
            return _GatewayResponse()

    async def _resolve(_visitor_id):
        return "worktool:AI测试"

    monkeypatch.setattr(messages.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(messages, "resolve_visitor_platform_open_id", _resolve)

    platform = SimpleNamespace(
        type="worktool",
        is_active=True,
        config={
            "gateway_url": "http://worktool-gateway:8790",
            "robot_id": "robot-1",
            "api_key": "gateway-secret",
        },
    )
    request = Request({"type": "http", "method": "POST", "path": "/v1/messages/send", "headers": []})
    req = messages.SendMessageRequest(
        platform_api_key="platform-key",
        from_uid="staff-1",
        channel_id="visitor-1-vtr",
        channel_type=251,
        payload={"type": 1, "content": "收到，正在处理"},
        client_msg_no="local-123",
    )

    result = await messages.send_message(req, request, _Db(platform))

    assert result["ok"] is True
    assert captured["headers"] == {"X-API-Key": "gateway-secret"}
    assert captured["json"] == {
        "robot_id": "robot-1",
        "title": "AI测试",
        "content": "收到，正在处理",
        "idempotency_key": "local-123",
    }


@pytest.mark.asyncio
async def test_manual_worktool_send_surfaces_gateway_http_error(monkeypatch):
    class _Response:
        status_code = 401

        def raise_for_status(self):
            request = httpx.Request("POST", "http://worktool-gateway:8790/api/send")
            response = httpx.Response(401, request=request)
            raise httpx.HTTPStatusError("unauthorized", request=request, response=response)

        def json(self):
            return {"detail": "invalid api key"}

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, *, json, headers=None):
            return _Response()

    async def _resolve(_visitor_id):
        return "worktool:AI测试"

    monkeypatch.setattr(messages.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(messages, "resolve_visitor_platform_open_id", _resolve)

    platform = SimpleNamespace(
        type="worktool",
        is_active=True,
        config={
            "gateway_url": "http://worktool-gateway:8790",
            "robot_id": "robot-1",
            "api_key": "wrong-secret",
        },
    )
    request = Request({"type": "http", "method": "POST", "path": "/v1/messages/send", "headers": []})
    req = messages.SendMessageRequest(
        platform_api_key="platform-key",
        from_uid="staff-1",
        channel_id="visitor-1-vtr",
        channel_type=251,
        payload={"type": 1, "content": "test"},
        client_msg_no="local-401",
    )

    response = await messages.send_message(req, request, _Db(platform))

    assert response.status_code == 502
    body = json.loads(response.body)
    assert body["error"]["code"] == "HTTP_ERROR"


@pytest.mark.asyncio
async def test_manual_worktool_send_does_not_report_queued_as_delivered(monkeypatch):
    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, *, json, headers=None):
            return _GatewayResponse()

    async def _resolve(_visitor_id):
        return "wt:robot-managed-123456:AI测试"

    async def _failed(*_args, **_kwargs):
        return {"status": "failed", "error": "phone could not confirm"}

    monkeypatch.setattr(messages.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(messages, "resolve_visitor_platform_open_id", _resolve)
    monkeypatch.setattr(messages, "_wait_worktool_result", _failed)
    platform = SimpleNamespace(
        type="worktool", is_active=True,
        config={"gateway_url": "http://worktool-gateway:8790", "robot_id": "robot-managed-123456"},
    )
    request = Request({"type": "http", "method": "POST", "path": "/v1/messages/send", "headers": []})
    req = messages.SendMessageRequest(
        platform_api_key="platform-key", from_uid="staff-1",
        channel_id="visitor-1-vtr", channel_type=251,
        payload={"type": 1, "content": "链路诊断"}, client_msg_no="local-failed",
    )

    response = await messages.send_message(req, request, _Db(platform))
    assert response.status_code == 502
    assert json.loads(response.body)["error"]["code"] == "WORKTOOL_SEND_UNCONFIRMED"


@pytest.mark.asyncio
async def test_manual_worktool_send_uses_managed_device_and_preserves_colons(monkeypatch):
    captured = {}

    async def _confirmed(*_args, **_kwargs):
        return {"status": "success"}
    monkeypatch.setattr(messages, "_wait_worktool_result", _confirmed)

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, *, json, headers=None):
            captured.update(url=url, json=json, headers=headers or {})
            return _GatewayResponse()

    async def _resolve(_visitor_id):
        return "wt:robot-managed-123456:AI测试:夜班群"

    monkeypatch.setenv("WORKTOOL_CONTROL_TOKEN", "control-secret")
    monkeypatch.setattr(messages.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(messages, "resolve_visitor_platform_open_id", _resolve)

    platform = SimpleNamespace(
        type="worktool",
        is_active=True,
        config={
            "gateway_url": "http://worktool-gateway:8790",
            "devices": [
                {"robot_id": "robot-managed-123456", "enabled": True},
                {"robot_id": "robot-disabled-123456", "enabled": False},
            ],
        },
    )
    request = Request({"type": "http", "method": "POST", "path": "/v1/messages/send", "headers": []})
    req = messages.SendMessageRequest(
        platform_api_key="platform-key",
        from_uid="staff-1",
        channel_id="visitor-1-vtr",
        channel_type=251,
        payload={"type": 1, "content": "已收到"},
        client_msg_no="local-managed",
    )

    result = await messages.send_message(req, request, _Db(platform))

    assert result["ok"] is True
    assert captured["headers"] == {"X-API-Key": "control-secret"}
    assert captured["json"]["robot_id"] == "robot-managed-123456"
    assert captured["json"]["title"] == "AI测试:夜班群"


@pytest.mark.asyncio
async def test_manual_worktool_send_downloads_and_queues_image(monkeypatch):
    calls = []

    async def _confirmed(*_args, **_kwargs):
        return {"status": "success"}
    monkeypatch.setattr(messages, "_wait_worktool_result", _confirmed)

    class _Response:
        def __init__(self, *, content=b"", headers=None, data=None):
            self.content = content
            self.headers = headers or {}
            self._data = data or {}

        def raise_for_status(self):
            return None

        def json(self):
            return self._data

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url):
            calls.append(("get", url, None, None))
            return _Response(content=b"image-bytes", headers={"content-type": "image/png"})

        async def post(self, url, *, json, headers=None):
            calls.append(("post", url, json, headers or {}))
            return _Response(data={"status": "queued", "send_id": "send-image-1"})

    async def _resolve(_visitor_id):
        return "wt:robot-managed-123456:AI测试"

    monkeypatch.setenv("WORKTOOL_CONTROL_TOKEN", "control-secret")
    monkeypatch.setattr(messages.httpx, "AsyncClient", _Client)
    monkeypatch.setattr(messages, "resolve_visitor_platform_open_id", _resolve)
    platform = SimpleNamespace(
        type="worktool", is_active=True,
        config={
            "gateway_url": "http://worktool-gateway:8790",
            "devices": [{"robot_id": "robot-managed-123456", "enabled": True}],
        },
    )
    request = Request({"type": "http", "method": "POST", "path": "/v1/messages/send", "headers": []})
    req = messages.SendMessageRequest(
        platform_api_key="platform-key", from_uid="staff-1",
        channel_id="visitor-1-vtr", channel_type=251,
        payload={"type": 2, "content": "[图片]", "url": "http://tgo-api:8000/v1/chat/files/reply.png"},
        client_msg_no="local-image-1",
    )

    result = await messages.send_message(req, request, _Db(platform))

    assert result["ok"] is True
    assert calls[0][:2] == ("get", "http://tgo-api:8000/v1/chat/files/reply.png")
    assert calls[1][0:2] == ("post", "http://worktool-gateway:8790/api/send/media")
    assert calls[1][2] == {
        "robot_id": "robot-managed-123456",
        "title": "AI测试",
        "filename": "reply.png",
        "content_type": "image/png",
        "content_base64": base64.b64encode(b"image-bytes").decode("ascii"),
        "caption": "",
        "idempotency_key": "local-image-1",
    }
    assert calls[1][3] == {"X-API-Key": "control-secret"}


def test_worktool_image_caption_preserves_real_text():
    assert messages._worktool_image_caption({"content": "配图说明"}) == "配图说明"
    assert messages._worktool_image_caption({"content": "[图片]"}) == ""
