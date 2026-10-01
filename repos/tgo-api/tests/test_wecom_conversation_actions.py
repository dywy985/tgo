from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.wecom_conversation_service import (
    ExternalGroup,
    ObservedGroup,
    build_member_fingerprint,
    match_external_groups,
    normalize_group_name,
    validate_jump_grant,
)


def test_group_name_normalization_is_nfkc_and_whitespace_stable():
    assert normalize_group_name("  好大夫\u3000单体药店上线群  ") == "好大夫 单体药店上线群"
    assert normalize_group_name("ＡＢＣ  群") == "abc 群"


def test_member_fingerprint_is_order_independent_and_ignores_blanks():
    assert build_member_fingerprint([" UserB ", "", "usera"]) == build_member_fingerprint(
        ["USERA", "userb"]
    )


def test_exact_group_match_uses_name_owner_and_members_without_business_chatid():
    observed = ObservedGroup(
        platform_id=uuid4(),
        conversation_key="wt:phone-1:售后群",
        robot_id="phone-1",
        conversation_name="售后群",
        owner_userid="owner-1",
        member_userids=("customer-1", "owner-1"),
    )
    groups = [
        ExternalGroup("chat-wrong", "售后群", "owner-2", ("customer-2", "owner-2")),
        ExternalGroup("chat-right", "售后群", "owner-1", ("owner-1", "customer-1")),
    ]

    result = match_external_groups(observed, groups)

    assert result.status == "available"
    assert result.chat_id == "chat-right"
    assert result.source == "externalcontact_api"


def test_duplicate_group_names_never_guess_when_identity_evidence_is_missing():
    observed = ObservedGroup(
        platform_id=uuid4(),
        conversation_key="wt:phone-1:重复群",
        robot_id="phone-1",
        conversation_name="重复群",
    )

    result = match_external_groups(
        observed,
        [
            ExternalGroup("chat-1", "重复群", None, ()),
            ExternalGroup("chat-2", "重复群", None, ()),
        ],
    )

    assert result.status == "ambiguous"
    assert result.chat_id is None


def test_jump_grant_is_five_minute_single_use_and_bound_to_staff():
    now = datetime(2026, 9, 5, 2, 0, tzinfo=timezone.utc)
    grant = SimpleNamespace(
        staff_id=uuid4(),
        expires_at=now + timedelta(minutes=5),
        used_at=None,
    )

    validate_jump_grant(grant, grant.staff_id, now=now)
    grant.used_at = now

    with pytest.raises(ValueError, match="已使用"):
        validate_jump_grant(grant, grant.staff_id, now=now)


def test_jump_grant_rejects_wrong_staff_and_expired_token():
    now = datetime(2026, 9, 5, 2, 0, tzinfo=timezone.utc)
    grant = SimpleNamespace(
        staff_id=uuid4(),
        expires_at=now - timedelta(seconds=1),
        used_at=None,
    )

    with pytest.raises(ValueError, match="已过期"):
        validate_jump_grant(grant, grant.staff_id, now=now)
    with pytest.raises(ValueError, match="无权"):
        validate_jump_grant(grant, uuid4(), now=now - timedelta(minutes=1))
