"""Rules shared by WeCom group binding and one-time jump actions.

The WorkTool conversation key remains the business identity.  The WeCom
``chat_id`` returned by the customer-contact API is transport-only data and is
never used to merge monitor conversations.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import re
import unicodedata
import secrets
from typing import Iterable, Optional, Sequence
from uuid import UUID


_WHITESPACE_RE = re.compile(r"\s+")


def normalize_group_name(value: str) -> str:
    """Return the canonical WorkTool/WeCom group-name comparison value."""
    normalized = unicodedata.normalize("NFKC", value or "")
    return _WHITESPACE_RE.sub(" ", normalized).strip().casefold()


def _normalize_userid(value: str) -> str:
    return unicodedata.normalize("NFKC", value or "").strip().casefold()


def build_member_fingerprint(userids: Iterable[str]) -> str:
    """Build an order-independent fingerprint without persisting raw members."""
    normalized = sorted({_normalize_userid(item) for item in userids if _normalize_userid(item)})
    return hashlib.sha256("\n".join(normalized).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ExternalGroup:
    chat_id: str
    name: str
    owner_userid: Optional[str]
    member_userids: tuple[str, ...]


@dataclass(frozen=True)
class ObservedGroup:
    platform_id: UUID
    conversation_key: str
    robot_id: str
    conversation_name: str
    owner_userid: Optional[str] = None
    member_userids: tuple[str, ...] = ()


@dataclass(frozen=True)
class GroupMatch:
    status: str
    chat_id: Optional[str] = None
    source: str = "externalcontact_api"
    reason: Optional[str] = None


def match_external_groups(
    observed: ObservedGroup,
    external_groups: Sequence[ExternalGroup],
) -> GroupMatch:
    """Select only a uniquely verified official customer-group result.

    A unique normalized group name is sufficient.  If names collide, stable
    owner/member evidence must narrow the result to exactly one group; otherwise
    the caller must surface an ambiguous state and withhold the jump button.
    """
    wanted_name = normalize_group_name(observed.conversation_name)
    candidates = [
        group for group in external_groups if normalize_group_name(group.name) == wanted_name
    ]
    if not candidates:
        return GroupMatch("unsupported", reason="企微客户群 API 未返回该群")
    if len(candidates) == 1:
        return GroupMatch("available", chat_id=candidates[0].chat_id)

    owner = _normalize_userid(observed.owner_userid or "")
    members = build_member_fingerprint(observed.member_userids) if observed.member_userids else None
    verified = candidates
    if owner:
        verified = [item for item in verified if _normalize_userid(item.owner_userid or "") == owner]
    if members:
        verified = [
            item for item in verified if build_member_fingerprint(item.member_userids) == members
        ]
    if (owner or members) and len(verified) == 1:
        return GroupMatch("available", chat_id=verified[0].chat_id)
    return GroupMatch("ambiguous", reason="存在同名群且群主/成员证据无法唯一确认")


def validate_jump_grant(grant, staff_id: UUID, *, now: Optional[datetime] = None) -> None:
    """Validate the immutable security constraints of a one-time jump grant."""
    current = now or datetime.now(timezone.utc)
    if grant.staff_id != staff_id:
        raise ValueError("无权使用该跳转凭据")
    expires_at = grant.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= current:
        raise ValueError("跳转凭据已过期")
    if grant.used_at is not None:
        raise ValueError("跳转凭据已使用")


def hash_jump_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_jump_grant(db, binding, staff, *, now: Optional[datetime] = None):
    """Persist only a token hash; return the bearer token once to the caller."""
    from app.models.reply_monitor import WeComJumpGrant

    current = now or datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    grant = WeComJumpGrant(
        project_id=binding.project_id,
        binding_id=binding.id,
        staff_id=staff.id,
        token_hash=hash_jump_token(token),
        expires_at=current + timedelta(minutes=5),
    )
    db.add(grant)
    db.flush()
    return token, grant
