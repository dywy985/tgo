"""Small in-process limiter for sensitive single-instance endpoints.

Deployments with more than one API replica should replace this store with Redis,
while preserving the same route-specific limits.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Optional


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(
        self,
        key: str,
        *,
        limit: int,
        window_seconds: int = 60,
        now: Optional[float] = None,
    ) -> bool:
        current = time.monotonic() if now is None else float(now)
        cutoff = current - window_seconds
        with self._lock:
            bucket = self._events[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(current)
            return True


def sensitive_route_policy(path: str) -> tuple[str, int] | None:
    if path == "/v1/staff/login":
        return "login", 10
    if path.startswith("/v1/public-tickets/"):
        return "public_ticket", 20
    if path.startswith("/v1/reply-monitor/events/") and path.endswith("/media"):
        return "monitor_media", 60
    if path == "/v1/reply-monitor/events":
        return "monitor_event", 300
    return None
