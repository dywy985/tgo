from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx

os.environ.setdefault("API_BASE_URL", "http://tgo-api:8001")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")

from app.domain.services.listeners import wecom_listener


class _Session:
    def __init__(self):
        self.commits = 0
        self.rollbacks = 0

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _SelectSession:
    def __init__(self, retry_rows):
        self._results = iter(([], retry_rows))
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _Rows(next(self._results))


def _http_status_error(status_code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "http://tgo-api/v1/reply-monitor/events")
    response = httpx.Response(status_code, request=request)
    return httpx.HTTPStatusError(
        f"upstream returned {status_code}", request=request, response=response
    )


def _finalize(error: Exception, *, source_type: str = "worktool"):
    listener = object.__new__(wecom_listener.WeComChannelListener)
    session = _Session()
    record = SimpleNamespace(
        source_type=source_type,
        status="processing",
        retry_count=3,
        error_message=None,
        processed_at=None,
    )
    platform = SimpleNamespace(id="platform-1")
    asyncio.run(listener._finalize_failure(session, platform, record, error))
    return record, session


def test_worktool_connection_failure_remains_retryable_after_limit():
    request = httpx.Request("POST", "http://tgo-api/v1/reply-monitor/events")
    record, session = _finalize(httpx.ConnectError("unavailable", request=request))

    assert record.status == "retrying"
    assert record.retry_count == 4
    assert session.commits == 1


def test_worktool_429_and_503_remain_retryable():
    for status_code in (408, 425, 429, 503):
        record, _ = _finalize(_http_status_error(status_code))
        assert record.status == "retrying"


def test_worktool_timeout_remains_retryable():
    request = httpx.Request("POST", "http://tgo-api/v1/reply-monitor/events")
    record, _ = _finalize(httpx.ReadTimeout("timed out", request=request))

    assert record.status == "retrying"


def test_worktool_permanent_4xx_remains_terminal():
    for status_code in (401, 422):
        record, _ = _finalize(_http_status_error(status_code))
        assert record.status == "failed"


def test_other_wecom_sources_keep_bounded_retry_behavior():
    request = httpx.Request("POST", "http://tgo-api/v1/reply-monitor/events")
    record, _ = _finalize(
        httpx.ConnectError("unavailable", request=request),
        source_type="wecom_bot",
    )

    assert record.status == "failed"


def test_retry_delay_is_exponential_and_capped_at_five_minutes():
    assert wecom_listener._retry_delay_seconds(0) == 1
    assert wecom_listener._retry_delay_seconds(3) == 8
    assert wecom_listener._retry_delay_seconds(100) == 300


def test_retrying_record_is_selected_even_after_bounded_retry_limit():
    listener = object.__new__(wecom_listener.WeComChannelListener)
    retrying = SimpleNamespace(
        retry_count=100,
        processed_at=datetime.now(timezone.utc) - timedelta(seconds=301),
    )
    session = _SelectSession([retrying])

    candidates = asyncio.run(listener._select_candidates(
        session,
        SimpleNamespace(id="platform-1"),
        batch_size=10,
        max_retries=3,
    ))

    assert candidates == [retrying]
    retry_params = session.statements[1].compile().params
    assert "retrying" in retry_params.values()
    assert 3 in retry_params.values()
