from __future__ import annotations

from collections.abc import Callable
from typing import Any


class AsyncClientPool:
    """Process-wide pool for reusable asynchronous HTTP clients."""

    def __init__(self) -> None:
        self._clients: dict[str, Any] = {}

    def get(self, key: str, factory: Callable[[], Any]) -> Any:
        client = self._clients.get(key)
        if client is None:
            client = factory()
            self._clients[key] = client
        return client

    async def close_all(self) -> None:
        clients = list(self._clients.values())
        self._clients.clear()
        for client in clients:
            await client.aclose()


shared_async_clients = AsyncClientPool()
