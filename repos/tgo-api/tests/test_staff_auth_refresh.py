"""Regression coverage for long-lived staff sessions."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import uuid4

from jose import jwt

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_refresh_token,
    verify_token,
)
from app.models import Staff
from app.api.v1.endpoints.staff import _build_staff_response
from app.schemas.staff import StaffUpdate


class _StaffQuery:
    def __init__(self, staff: Staff) -> None:
        self.staff = staff

    def filter(self, *args: object) -> "_StaffQuery":
        return self

    def first(self) -> Staff:
        return self.staff


class _StaffDB:
    def __init__(self, staff: Staff) -> None:
        self.staff = staff

    def query(self, model: object) -> _StaffQuery:
        return _StaffQuery(self.staff)


def test_staff_update_accepts_wecom_userid() -> None:
    payload = StaffUpdate(wecom_userid="  ZhangSan  ")

    assert payload.wecom_userid == "ZhangSan"


def _staff() -> Staff:
    now = datetime.utcnow()
    return Staff(
        id=uuid4(),
        project_id=uuid4(),
        username="session-user",
        password_hash="unused",
        name="Session User",
        nickname="Session",
        role="user",
        status="online",
        is_active=True,
        service_paused=False,
        created_at=now,
        updated_at=now,
    )


def test_access_and_refresh_tokens_have_separate_purposes() -> None:
    access_token = create_access_token(subject="staff-user")
    refresh_token = create_refresh_token(subject="staff-user")

    assert verify_token(access_token)["token_type"] == "access"
    assert verify_refresh_token(refresh_token)["token_type"] == "refresh"
    assert verify_token(refresh_token) is None
    assert verify_refresh_token(access_token) is None


def test_staff_response_preserves_wecom_userid() -> None:
    staff = _staff()
    staff.wecom_userid = "configured-member-id"

    response = _build_staff_response(staff)

    assert response.wecom_userid == "configured-member-id"


def test_legacy_access_token_without_type_remains_valid_until_expiry() -> None:
    legacy_token = jwt.encode(
        {
            "sub": "legacy-user",
            "exp": datetime.utcnow() + timedelta(minutes=5),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

    assert verify_token(legacy_token)["sub"] == "legacy-user"


def test_refresh_endpoint_rotates_cookie_and_returns_access_token(
    client: object,
    db_override: object,
) -> None:
    staff = _staff()
    db_override.session = _StaffDB(staff)
    refresh_token = create_refresh_token(
        subject=staff.username,
        project_id=staff.project_id,
        role=staff.role,
    )

    response = client.post(
        "/v1/staff/refresh",
        cookies={settings.REFRESH_COOKIE_NAME: refresh_token},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["staff"]["username"] == staff.username
    assert payload["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert verify_token(payload["access_token"])["sub"] == staff.username
    cookie = response.headers["set-cookie"]
    assert settings.REFRESH_COOKIE_NAME in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie


def test_refresh_endpoint_rejects_missing_cookie(client: object) -> None:
    response = client.post("/v1/staff/refresh")

    assert response.status_code == 401


def test_logout_clears_refresh_cookie(client: object) -> None:
    response = client.post("/v1/staff/logout")

    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    assert settings.REFRESH_COOKIE_NAME in cookie
    assert "Max-Age=0" in cookie
