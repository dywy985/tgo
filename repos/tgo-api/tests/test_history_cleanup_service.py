from datetime import datetime, timezone

import pytest

from app.services.history_cleanup_service import (
    DEFAULT_CUTOFF_UTC,
    cleanup_fingerprint,
    hash_cleanup_token,
    parse_cleanup_cutoff,
    verify_cleanup_token,
)


def test_beijing_cutoff_converts_to_exact_utc_boundary():
    assert parse_cleanup_cutoff("2026-09-04T00:00:00+08:00") == DEFAULT_CUTOFF_UTC
    assert DEFAULT_CUTOFF_UTC == datetime(2026, 9, 3, 16, 0, tzinfo=timezone.utc)


def test_cleanup_cutoff_must_be_timezone_aware():
    with pytest.raises(ValueError):
        parse_cleanup_cutoff("2026-09-04T00:00:00")


def test_cleanup_token_binds_project_cutoff_counts_and_target_ids():
    fingerprint = cleanup_fingerprint("project-1", DEFAULT_CUTOFF_UTC, {"tickets": 2}, ["b", "a"])
    token = "one-time-token"
    digest = hash_cleanup_token(token, fingerprint)

    assert verify_cleanup_token(token, fingerprint, digest)
    assert not verify_cleanup_token(token, fingerprint + "changed", digest)
