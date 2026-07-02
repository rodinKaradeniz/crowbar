"""
Async Redis client singleton.

Usage:
    from app.core.redis_client import get_redis, close_redis

    r = await get_redis()
    await r.xadd("crowbar:events", {...})
"""
import logging

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
        logger.info("Redis client closed")
