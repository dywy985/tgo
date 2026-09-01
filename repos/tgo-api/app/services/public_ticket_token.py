from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional


class InvalidPublicTicketToken(ValueError):
    pass


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def issue_public_ticket_token(
    *,
    secret: str,
    project_id: str,
    visitor_id: Optional[str],
    platform_id: Optional[str],
    group_key: Optional[str],
    expires_at: int,
) -> str:
    if not secret or not project_id:
        raise ValueError("secret and project_id are required")
    payload = {
        "purpose": "public_ticket",
        "project_id": str(project_id),
        "visitor_id": str(visitor_id) if visitor_id else None,
        "platform_id": str(platform_id) if platform_id else None,
        "group_key": group_key,
        "exp": int(expires_at),
    }
    encoded_payload = _b64encode(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(
        secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256
    ).digest()
    return encoded_payload + "." + _b64encode(signature)


def decode_public_ticket_token(
    token: str, *, secret: str, now: Optional[int] = None
) -> Dict[str, Any]:
    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        supplied_signature = _b64decode(encoded_signature)
        expected_signature = hmac.new(
            secret.encode("utf-8"), encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(supplied_signature, expected_signature):
            raise InvalidPublicTicketToken("invalid signature")
        payload = json.loads(_b64decode(encoded_payload).decode("utf-8"))
    except InvalidPublicTicketToken:
        raise
    except Exception as exc:
        raise InvalidPublicTicketToken("invalid token") from exc

    if payload.get("purpose") != "public_ticket" or not payload.get("project_id"):
        raise InvalidPublicTicketToken("invalid token purpose")
    current_time = int(time.time()) if now is None else int(now)
    if int(payload.get("exp") or 0) < current_time:
        raise InvalidPublicTicketToken("token expired")
    return payload
