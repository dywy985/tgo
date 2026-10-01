from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import platform_connections as pc


def test_only_admin_can_mutate_connection_configuration():
    with pytest.raises(HTTPException) as exc:
        pc._admin(SimpleNamespace(role="agent"))
    assert exc.value.status_code == 403


def test_aibot_secret_is_masked_and_role_is_notification_only():
    public, secrets = pc._normalize_aibot({
        "bot_id": "bot-real", "secret": "very-secret-value", "bot_name": "内部提醒",
    }, "")
    assert public["secret_last4"] == "alue"
    assert "very-secret-value" not in str(public)
    assert public["message_source"] == "internal_notifications_only"
    assert secrets == {"secret": "very-secret-value"}


def test_aibot_rejects_non_allowlisted_websocket_url(monkeypatch):
    monkeypatch.delenv("WECOM_WS_URL_ALLOWLIST", raising=False)
    with pytest.raises(HTTPException) as exc:
        pc._normalize_aibot({"bot_id": "bot", "secret": "12345678", "ws_url": "wss://attacker.example"}, "")
    assert exc.value.status_code == 422


def test_gateway_rejects_public_ssrf_target(monkeypatch):
    monkeypatch.delenv("CHANNEL_GATEWAY_HOST_ALLOWLIST", raising=False)
    with pytest.raises(HTTPException) as exc:
        pc._allowed_service_url("https://example.com/gateway")
    assert exc.value.status_code == 422


def test_worktool_runtime_status_preserves_gateway_config_version():
    active = {
        "offline_threshold_seconds": 60,
        "devices": [{"robot_id": "robot-1", "name": "手机一", "enabled": True}],
    }
    gateway = {
        "config_version": 7,
        "robots": [{
            "robot_id": "robot-1",
            "idle_sec": 2,
            "pending_media_uploads": 3,
            "last_media_upload_at": 1_725_000_000,
            "last_capture_source": "cache",
        }],
    }

    status = pc._build_worktool_runtime_status(active, gateway)

    assert status["config_version"] == 7
    assert status["state"] == "CONNECTED"
    assert status["devices"][0]["pending_media_uploads"] == 3


def test_robot_worktool_device_needs_no_staff_or_wecom_userid():
    public, secrets = pc._normalize_worktool(
        object(),
        SimpleNamespace(project_id="project-1"),
        {
            "gateway_url": "http://127.0.0.1:8790",
            "devices": [{
                "name": "金博手机",
                "robot_id": "robot-identity-test-123456",
                "device_mode": "robot",
                "bound_staff_id": "old-staff-id",
                "enabled": True,
                "identity_confirmed": True,
            }],
        },
        {"_secrets": {"robot-identity-test-123456": "long-device-secret-for-existing-phone"}},
    )

    device = public["devices"][0]
    assert device["device_mode"] == "robot"
    assert device["bound_staff_id"] == ""
    assert device["wecom_userid"] == ""
    assert secrets[device["robot_id"]] == "long-device-secret-for-existing-phone"
