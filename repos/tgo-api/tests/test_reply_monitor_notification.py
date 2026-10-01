from types import SimpleNamespace
from unittest.mock import AsyncMock
from datetime import datetime, timezone

import pytest
from sqlalchemy.dialects import postgresql

from app.services import wecom_app_client
from app.tasks import reply_monitor_reminders


def test_existing_reminded_problem_is_selected_for_ticket_backfill_before_next_reminder():
    clause = reply_monitor_reminders._batch_due_filter(
        datetime(2026, 9, 3, 2, 0, tzinfo=timezone.utc)
    )
    sql = str(clause.compile(dialect=postgresql.dialect()))
    ticket_branch = sql.split(" OR ", 1)[1]

    assert "ticket_id IS NULL" in ticket_branch
    assert "is_problem_candidate" in ticket_branch
    assert "reminder_count" in ticket_branch
    assert "next_reminder_at IS NULL" not in ticket_branch


def test_reminder_delivery_toggle_is_independent_and_backwards_compatible():
    assert reply_monitor_reminders._reminder_delivery_enabled(
        SimpleNamespace(reminders_enabled=False)
    ) is False
    assert reply_monitor_reminders._reminder_delivery_enabled(
        SimpleNamespace(reminders_enabled=True)
    ) is True
    assert reply_monitor_reminders._reminder_delivery_enabled(SimpleNamespace()) is True


class _PlatformQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def all(self):
        return self.rows


class _Db:
    def __init__(self, platforms):
        self.platforms = platforms

    def query(self, model):
        return _PlatformQuery(self.platforms)


def _staff(userid="LiuHongFan"):
    return SimpleNamespace(
        project_id="project-1",
        wecom_userid=userid,
        name="刘泓凡",
        nickname="刘泓凡",
        username="liuhongfan",
    )


def _platform(platform_type, config):
    return SimpleNamespace(
        id=f"{platform_type}-1",
        type=platform_type,
        config=config,
        created_at=None,
    )


@pytest.mark.asyncio
async def test_private_reminder_uses_wecom_userid_for_configured_app(monkeypatch):
    app = _platform("wecom", {"corp_id": "corp", "agent_id": "1001", "app_secret": "secret"})
    send_app = AsyncMock(return_value=True)
    monkeypatch.setattr(wecom_app_client, "send_wecom_app_message", send_app)

    transport = await wecom_app_client.send_staff_private_reminder(
        _Db([app]), _staff(), "请处理外部群-4的问题"
    )

    assert transport == "wecom_app"
    send_app.assert_awaited_once_with(app, "LiuHongFan", "请处理外部群-4的问题")


@pytest.mark.asyncio
async def test_private_reminder_does_not_report_success_when_wecom_api_fails(monkeypatch):
    app = _platform("wecom", {"corp_id": "corp", "agent_id": "1001", "app_secret": "secret"})
    monkeypatch.setattr(
        wecom_app_client,
        "send_wecom_app_message",
        AsyncMock(return_value=False),
    )

    with pytest.raises(wecom_app_client.PrivateReminderDeliveryError, match="发送失败"):
        await wecom_app_client.send_staff_private_reminder(_Db([app]), _staff(), "提醒")


@pytest.mark.asyncio
async def test_private_reminder_uses_smart_bot_userid_channel(monkeypatch):
    bot = _platform(
        "wecom_bot",
        {
            "sender_url": "http://wecom-aibot-sender:8791",
            "send_token": "token",
        },
    )
    send_bot = AsyncMock(return_value=True)
    monkeypatch.setattr(wecom_app_client, "send_wecom_bot_private_message", send_bot)

    transport = await wecom_app_client.send_staff_private_reminder(
        _Db([bot]), _staff(), "提醒"
    )

    assert transport == "wecom_bot"
    send_bot.assert_awaited_once_with(bot, "LiuHongFan", "提醒")


@pytest.mark.asyncio
async def test_private_reminder_never_uses_worktool_as_bot_fallback(monkeypatch):
    worktool = _platform(
        "worktool",
        {
            "gateway_url": "http://worktool-gateway:8790",
            "robot_id": "robot-1",
            "api_key": "key",
            "bound_wecom_userid": "AnotherRobotOwner",
        },
    )
    send_worktool = AsyncMock(return_value=True)
    monkeypatch.setattr(wecom_app_client, "send_worktool_private_message", send_worktool)

    with pytest.raises(wecom_app_client.PrivateReminderDeliveryError, match="未配置"):
        await wecom_app_client.send_staff_private_reminder(_Db([worktool]), _staff(), "提醒")
    send_worktool.assert_not_awaited()


@pytest.mark.asyncio
async def test_worktool_robot_is_not_an_internal_reminder_transport(monkeypatch):
    worktool = _platform(
        "worktool",
        {
            "gateway_url": "http://worktool-gateway:8790",
            "robot_id": "robot-1",
            "bound_wecom_userid": "liuhongfan",
        },
    )
    send_worktool = AsyncMock(return_value=True)
    monkeypatch.setattr(wecom_app_client, "send_worktool_private_message", send_worktool)

    with pytest.raises(wecom_app_client.PrivateReminderDeliveryError, match="未配置"):
        await wecom_app_client.send_staff_private_reminder(_Db([worktool]), _staff(), "提醒")

    send_worktool.assert_not_awaited()


@pytest.mark.asyncio
async def test_private_reminder_requires_a_real_delivery_channel():
    with pytest.raises(wecom_app_client.PrivateReminderDeliveryError, match="未配置"):
        await wecom_app_client.send_staff_private_reminder(_Db([]), _staff(), "提醒")


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class _HttpClient:
    def __init__(self):
        self.post_call = None
        self.get_calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, *, json, headers):
        self.post_call = (url, json, headers)
        return _Response({"send_id": "send-1", "status": "queued"})

    async def get(self, url, *, headers):
        self.get_calls.append((url, headers))
        return _Response({"send_id": "send-1", "status": "success"})


@pytest.mark.asyncio
async def test_worktool_private_message_waits_for_phone_success(monkeypatch):
    client = _HttpClient()
    monkeypatch.setattr(wecom_app_client.httpx, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(wecom_app_client.asyncio, "sleep", AsyncMock())
    platform = _platform(
        "worktool",
        {
            "gateway_url": "http://worktool-gateway:8790",
            "robot_id": "robot-1",
            "api_key": "key",
        },
    )

    sent = await wecom_app_client.send_worktool_private_message(platform, "客服甲", "提醒")

    assert sent is True
    assert client.post_call == (
        "http://worktool-gateway:8790/api/send",
        {"robot_id": "robot-1", "title": "客服甲", "content": "提醒"},
        {"X-API-Key": "key"},
    )
    assert client.get_calls == [
        ("http://worktool-gateway:8790/api/sends/send-1", {"X-API-Key": "key"})
    ]


class _BotHttpClient:
    def __init__(self):
        self.post_call = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, *, json, headers):
        self.post_call = (url, json, headers)
        return _Response({"ok": True, "chatid": json["chatid"]})


@pytest.mark.asyncio
async def test_smart_bot_private_message_posts_userid_to_internal_sender(monkeypatch):
    client = _BotHttpClient()
    monkeypatch.setattr(wecom_app_client.httpx, "AsyncClient", lambda **kwargs: client)
    platform = _platform(
        "wecom_bot",
        {
            "sender_url": "http://wecom-aibot-sender:8791",
            "send_token": "token",
        },
    )

    sent = await wecom_app_client.send_wecom_bot_private_message(
        platform, "LiuHongFan", "提醒"
    )

    assert sent is True
    assert client.post_call == (
        "http://wecom-aibot-sender:8791/api/send",
        {"chatid": "LiuHongFan", "content": "提醒", "msgtype": "markdown"},
        {"X-Send-Token": "token"},
    )


@pytest.mark.asyncio
async def test_smart_bot_private_message_forwards_idempotency_key(monkeypatch):
    client = _BotHttpClient()
    monkeypatch.setattr(wecom_app_client.httpx, "AsyncClient", lambda **kwargs: client)
    platform = _platform(
        "wecom_bot",
        {"sender_url": "http://wecom-aibot-sender:8791", "send_token": "token"},
    )

    sent = await wecom_app_client.send_wecom_bot_private_message(
        platform, "LiuHongFan", "提醒", idempotency_key="reply-monitor:1"
    )

    assert sent is True
    assert client.post_call[1]["idempotency_key"] == "reply-monitor:1"


@pytest.mark.asyncio
async def test_reminder_task_propagates_private_delivery_failure(monkeypatch):
    failure = wecom_app_client.PrivateReminderDeliveryError("发送失败")
    send_private = AsyncMock(side_effect=failure)
    monkeypatch.setattr(wecom_app_client, "send_staff_private_reminder", send_private)

    with pytest.raises(wecom_app_client.PrivateReminderDeliveryError, match="发送失败"):
        await reply_monitor_reminders._send("wecom_app", _staff(), "提醒", _Db([]))
