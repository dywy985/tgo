from __future__ import annotations
import json
from typing import Optional

import httpx
from pydantic import BaseModel

from app.core.config import settings
from app.domain.entities import VisitorInfo
from redis import asyncio as aioredis  # type: ignore



class VisitorRegisterPayload(BaseModel):
    """Payload for visitor registration."""

    platform_api_key: str
    project_id: str
    platform_type: str
    platform_open_id: str
    nickname: str | None = None
    avatar_url: str | None = None


class VisitorService:
    """Service to register and cache visitor info against tgo-api via Redis only.

    - Redis is mandatory for caching. No in-memory fallback.
    - Any Redis-related errors are allowed to propagate to the caller (fail fast).
    """

    def __init__(
        self,
        base_url: str | None = None,
        redis_url: str | None = None,
        cache_ttl_seconds: int = 24 * 60 * 60,
    ) -> None:
        self._base_url = base_url or settings.api_base_url
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=settings.request_timeout_seconds)
        self._cache_ttl = int(cache_ttl_seconds)
        self._redis_url = redis_url or settings.redis_url
        self._redis = None

    async def _ensure_redis(self) -> None:
        if self._redis is not None:
            return
        if not self._redis_url:
            raise RuntimeError("Redis URL not configured")
        if not aioredis:
            raise RuntimeError("redis asyncio client not available; please install 'redis' package")
        self._redis = aioredis.from_url(self._redis_url, encoding="utf-8", decode_responses=True)
        # Validate connection
        await self._redis.ping()

    @staticmethod
    def make_cache_key(project_id: str, platform_type: str, platform_open_id: str) -> str:
        return f"visitor:{project_id}:{platform_type}:{platform_open_id}".lower()

    async def get_cached(self, key: str) -> Optional[VisitorInfo]:
        await self._ensure_redis()
        data = await self._redis.get(key)  # type: ignore
        if not data:
            return None
        return VisitorInfo.model_validate(json.loads(data))

    async def set_cached(self, key: str, data: VisitorInfo) -> None:
        await self._ensure_redis()
        await self._redis.set(key, data.model_dump_json(), ex=self._cache_ttl)  # type: ignore

    async def register_or_get(
        self,
        platform_api_key: str,
        project_id: str,
        platform_type: str,
        platform_open_id: str,
        nickname: str | None = None,
        avatar_url: str | None = None,
    ) -> VisitorInfo:
        """Return cached or freshly registered visitor data.

        If cache is missed or stale, POST to tgo-api /v1/visitors/register.
        """
        key = self.make_cache_key(project_id, platform_type, platform_open_id)
        cached = await self.get_cached(key)
        if cached:
            return cached

        payload = VisitorRegisterPayload(
            platform_api_key=platform_api_key,
            project_id=project_id,
            platform_type=platform_type,
            platform_open_id=platform_open_id,
            nickname=nickname,
            avatar_url=avatar_url,
        )
        try:
            resp = await self._client.post("/v1/visitors/register", json=payload.model_dump())
            resp.raise_for_status()
            data = resp.json()
            visitor = VisitorInfo.model_validate(data)
            # Cache successful result
            await self.set_cached(key, visitor)
            return visitor
        except Exception as e:
            print(f"[VISITOR] Registration failed for {platform_type}:{platform_open_id}: {e}")
            raise

    async def aclose(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            pass

