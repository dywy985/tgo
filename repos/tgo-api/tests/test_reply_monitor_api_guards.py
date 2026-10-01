import asyncio
from types import SimpleNamespace
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import reply_monitor as reply_monitor_endpoint
from app.api.v1.endpoints.reply_monitor import (
    _observed_member_candidate,
    _private_media_headers,
    _require_monitor_admin,
    _resolve_private_media_path,
    _settings_dict,
    set_group_owner_override,
    bind_event_owner_to_visitor_chat,
)
from app.api.v1.endpoints.debug_wecom import _debug_media_items, _require_debug_admin
from app.models import Staff, TicketRoute
from app.schemas.reply_monitor import ReplyMonitorOwnerOverrideUpdate


def test_reply_monitor_settings_require_an_admin():
    with pytest.raises(HTTPException) as exc:
        _require_monitor_admin(SimpleNamespace(role="user"))

    assert exc.value.status_code == 403


def test_reply_monitor_admin_can_update_settings():
    admin = SimpleNamespace(role="admin")

    assert _require_monitor_admin(admin) is admin


def test_debug_chat_history_cleanup_requires_an_admin():
    with pytest.raises(HTTPException) as exc:
        _require_debug_admin(SimpleNamespace(role="user"))
    assert exc.value.status_code == 403


def test_settings_response_exposes_independent_reminder_toggle():
    row = SimpleNamespace(
        enabled=True,
        reminders_enabled=False,
        timezone="Asia/Shanghai",
        weekly_schedule={},
        first_reminder_minutes=30,
        repeat_reminder_minutes=60,
        max_reminders=3,
        notification_channels={"in_app": True, "wecom_app": True},
    )

    response = _settings_dict(row)

    assert response["enabled"] is True
    assert response["reminders_enabled"] is False


def test_monitor_media_path_cannot_escape_upload_directory(tmp_path: Path):
    image = tmp_path / "reply-monitor" / "safe.png"
    image.parent.mkdir()
    image.write_bytes(b"png")

    assert _resolve_private_media_path(str(tmp_path), "reply-monitor/safe.png") == image.resolve()
    assert _resolve_private_media_path(str(tmp_path), "../secret.txt") is None


def test_monitor_media_response_is_private_and_not_sniffable():
    headers = _private_media_headers()

    assert headers["Cache-Control"] == "private, no-store"
    assert headers["X-Content-Type-Options"] == "nosniff"


class _OwnerOverrideQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args):
        return self

    def order_by(self, *args):
        return self

    def first(self):
        return self.rows[0] if self.rows else None


class _OwnerOverrideDb:
    def __init__(self, staff):
        self.staff = staff
        self.added = []

    def query(self, model):
        if model is Staff:
            return _OwnerOverrideQuery([self.staff])
        if model is TicketRoute:
            return _OwnerOverrideQuery([])
        raise AssertionError(f"unexpected model: {model}")

    def add(self, row):
        self.added.append(row)

    def commit(self):
        return None


def test_manual_group_owner_can_be_saved_without_wecom_userid(monkeypatch):
    from uuid import uuid4

    project_id = uuid4()
    platform_id = uuid4()
    staff_id = uuid4()
    staff = SimpleNamespace(
        id=staff_id, project_id=project_id, name="群主甲", nickname=None,
        username="owner-a", wecom_userid=None, is_active=True,
        deleted_at=None, role="user",
    )
    db = _OwnerOverrideDb(staff)
    monkeypatch.setattr(
        reply_monitor_endpoint, "_override_platform",
        lambda *_args, **_kwargs: SimpleNamespace(id=platform_id),
    )

    result = set_group_owner_override(
        platform_id,
        ReplyMonitorOwnerOverrideUpdate(staff_id=staff_id),
        group_key="客户服务群A",
        db=db,
        current_user=SimpleNamespace(project_id=project_id, role="admin"),
    )

    assert result["ok"] is True
    assert "仅接收站内提醒" in result["message"]
    assert len(db.added) == 1
    assert db.added[0].staff_id == staff_id


def test_dismiss_pending_requires_admin_and_scopes_to_project(monkeypatch):
    from uuid import uuid4
    from fastapi import HTTPException
    from app.api.v1.endpoints.reply_monitor import dismiss_pending

    project_id, batch_id = uuid4(), uuid4()
    calls = []
    monkeypatch.setattr(
        reply_monitor_endpoint.reply_monitor_service,
        "dismiss_pending_batch",
        lambda db, project, batch: calls.append((db, project, batch)) or True,
    )
    db = object()
    with pytest.raises(HTTPException) as denied:
        dismiss_pending(batch_id, db=db, current_user=SimpleNamespace(project_id=project_id, role="user"))
    assert denied.value.status_code == 403
    assert calls == []

    result = dismiss_pending(batch_id, db=db, current_user=SimpleNamespace(project_id=project_id, role="admin"))
    assert result == {"ok": True, "batch_id": batch_id}
    assert calls == [(db, project_id, batch_id)]


def test_observed_group_member_prefers_stable_userid_and_keeps_display_name():
    candidate = _observed_member_candidate(SimpleNamespace(
        sender_kind="unknown", sender_id="EXT-001", sender_name="  Ａlice  ",
    ))

    assert candidate == {
        "identity_type": "userid",
        "identity_value": "ext-001",
        "display_name": "Alice",
    }


def test_monitor_event_owner_is_attached_to_the_group_visitor_chat(monkeypatch):
    from uuid import uuid4

    project_id = uuid4()
    owner_id = uuid4()
    visitor_id = uuid4()
    event = SimpleNamespace(
        responsible_staff_id=None,
        conversation_type="group",
        conversation_key="群A",
        event_metadata={"group_owner_name": "群主甲"},
    )
    calls = []

    class _Db:
        def commit(self):
            calls.append("commit")

    monkeypatch.setattr(
        reply_monitor_endpoint.reply_monitor_service,
        "_responsible_staff_id",
        lambda *_args: owner_id,
    )

    async def _add_staff(db, project_id_arg, visitor_id_arg, staff_id_arg, **kwargs):
        calls.append((project_id_arg, visitor_id_arg, staff_id_arg, kwargs))

    monkeypatch.setattr(reply_monitor_endpoint, "_add_staff_to_channel", _add_staff)

    result = asyncio.run(bind_event_owner_to_visitor_chat(
        _Db(), SimpleNamespace(project_id=project_id), event,
        SimpleNamespace(id=visitor_id, project_id=project_id),
    ))

    assert result == {"bound": True, "responsible_staff_id": owner_id, "reason": None}
    assert event.responsible_staff_id == owner_id
    assert calls[0] == (
        project_id, visitor_id, owner_id,
        {"ai_disabled": True, "send_notification": False},
    )
    assert calls[1] == "commit"


def test_system_or_blank_group_sender_is_not_a_roster_candidate():
    assert _observed_member_candidate(SimpleNamespace(
        sender_kind="system", sender_id=None, sender_name="系统",
    )) is None


def test_debug_media_items_expose_authenticated_resolution_metadata():
    media = SimpleNamespace(
        id="media-1", message_id="message-1", content_type="image/png",
        file_size=321, width=640, height=480, status="ready",
        capture_source="screen_crop",
    )

    assert _debug_media_items([media]) == {
        "message-1": [{
            "id": "media-1", "content_type": "image/png", "file_size": 321,
            "width": 640, "height": 480, "status": "ready",
            "capture_source": "screen_crop",
            "url": "/v1/reply-monitor/media/media-1",
        }]
    }
    assert _observed_member_candidate(SimpleNamespace(
        sender_kind="unknown", sender_id=None, sender_name="  ",
    )) is None
