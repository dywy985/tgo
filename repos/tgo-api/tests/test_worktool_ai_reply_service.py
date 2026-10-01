import pytest
import httpx


def test_ai_reply_policy_only_allows_detected_customer_text_in_exact_test_group():
    from app.services.worktool_ai_reply_service import should_auto_reply

    allowed = {"AI测试"}
    assert should_auto_reply(
        allowed_groups=allowed,
        conversation_name="AI测试",
        sender_kind="customer",
        message_type="text",
        content="打印不了，怎么处理？",
        duplicate=False,
        ignored=False,
        has_pending_batch=True,
    )
    assert not should_auto_reply(
        allowed_groups=allowed,
        conversation_name="AI测试2",
        sender_kind="customer",
        message_type="text",
        content="打印不了",
        duplicate=False,
        ignored=False,
        has_pending_batch=True,
    )
    assert not should_auto_reply(
        allowed_groups=allowed,
        conversation_name="AI测试",
        sender_kind="staff",
        message_type="text",
        content="请重启打印机",
        duplicate=False,
        ignored=False,
        has_pending_batch=True,
    )
    assert not should_auto_reply(
        allowed_groups=allowed,
        conversation_name="AI测试",
        sender_kind="customer",
        message_type="image",
        content="[图片]",
        duplicate=False,
        ignored=False,
        has_pending_batch=True,
    )
    assert not should_auto_reply(
        allowed_groups=allowed,
        conversation_name="AI测试",
        sender_kind="customer",
        message_type="text",
        content="好的谢谢",
        duplicate=False,
        ignored=False,
        has_pending_batch=False,
    )


def test_parse_allowed_groups_normalizes_whitespace_and_ignores_empty_values():
    from app.services.worktool_ai_reply_service import parse_allowed_groups

    assert parse_allowed_groups(" AI测试, ,另一个测试群 ") == {"AI测试", "另一个测试群"}


@pytest.mark.asyncio
async def test_generate_and_send_uses_same_phone_group_and_message_idempotency():
    from app.services.worktool_ai_reply_service import generate_and_send_reply

    calls = {}

    class FakeAiClient:
        async def run_supervisor_agent(self, message, project_id, **kwargs):
            calls["ai"] = {"message": message, "project_id": project_id, **kwargs}
            return {"content": "请检查打印服务是否启动。"}

    async def fake_sender(**kwargs):
        calls["send"] = kwargs
        return {"status": "success", "send_id": "send-1"}

    result = await generate_and_send_reply(
        project_id="project-1",
        robot_id="robot-1234567890",
        conversation_name="AI测试",
        sender_identity="customer-1",
        message_id="message-1",
        content="打印不了，怎么处理？",
        ai_client=FakeAiClient(),
        sender=fake_sender,
    )

    assert result == {"status": "success", "send_id": "send-1", "reply": "请检查打印服务是否启动。"}
    assert calls["ai"]["session_id"] == "worktool:robot-1234567890:AI测试"
    assert calls["send"]["robot_id"] == "robot-1234567890"
    assert calls["send"]["title"] == "AI测试"
    assert calls["send"]["idempotency_key"] == "ai-reply:message-1"


@pytest.mark.asyncio
async def test_generate_and_send_does_not_send_empty_ai_output():
    from app.services.worktool_ai_reply_service import generate_and_send_reply

    class FakeAiClient:
        async def run_supervisor_agent(self, *args, **kwargs):
            return {"content": "  "}

    async def fail_sender(**kwargs):
        raise AssertionError("sender must not be called")

    result = await generate_and_send_reply(
        project_id="project-1",
        robot_id="robot-1234567890",
        conversation_name="AI测试",
        sender_identity="customer-1",
        message_id="message-2",
        content="作废不了",
        ai_client=FakeAiClient(),
        sender=fail_sender,
    )

    assert result["status"] == "empty_ai_reply"


@pytest.mark.asyncio
async def test_send_worktool_text_uses_gateway_api_key(monkeypatch):
    from app.services import worktool_ai_reply_service as service

    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/api/send":
            return httpx.Response(200, json={"send_id": "send-1", "status": "queued"})
        return httpx.Response(200, json={"send_id": "send-1", "status": "success"})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        service.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    result = await service.send_worktool_text(
        gateway_url="http://worktool-gateway:8790",
        control_token="test-key",
        robot_id="robot-1",
        title="AI测试",
        content="测试回复",
        idempotency_key="ai-reply:message-1",
    )

    assert result["status"] == "success"
    assert len(requests) == 2
    assert all(request.headers["X-API-Key"] == "test-key" for request in requests)
