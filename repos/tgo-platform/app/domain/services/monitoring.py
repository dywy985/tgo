from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def monitor_event_should_sync_as_customer(
    api_result: Mapping[str, Any] | None,
    raw_sender_kind: str,
) -> bool:
    """Use the API's authoritative identity decision for chat bubble direction."""
    effective_kind = (
        str((api_result or {}).get("effective_sender_kind") or "").strip().lower()
    )
    if not effective_kind:
        effective_kind = str(raw_sender_kind or "").strip().lower()
    return effective_kind == "customer"


def monitor_event_should_sync_to_owner_chat(
    api_result: Mapping[str, Any] | None,
    raw_sender_kind: str,
    conversation_type: str,
) -> bool:
    """Mirror every non-system group event into its owner-facing chat."""
    if str(conversation_type or "").strip().lower() != "group":
        return monitor_event_should_sync_as_customer(api_result, raw_sender_kind)
    effective_kind = str(
        (api_result or {}).get("effective_sender_kind") or raw_sender_kind or ""
    ).strip().lower()
    return effective_kind != "system"
