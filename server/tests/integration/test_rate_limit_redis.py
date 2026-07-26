"""Validate the rolling-window Lua script against Redis when it is available."""

import uuid

import pytest
import redis.asyncio as aioredis
from fastapi import HTTPException
from redis.exceptions import RedisError

from app.config import settings
from app.core.rate_limit import RateLimitCheck, RateLimitPolicy, RateLimiter


@pytest.mark.asyncio
async def test_redis_sliding_window_blocks_then_recovers_after_window():
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await redis.ping()
    except RedisError:
        await redis.aclose()
        pytest.skip("Redis is not available for the integration check")

    async def provider():
        return redis

    limiter = RateLimiter(
        redis_provider=provider,
        enabled_provider=lambda: True,
    )
    check = RateLimitCheck(
        RateLimitPolicy("redis_integration", 2, 60),
        (uuid.uuid4().hex,),
    )

    try:
        await limiter.enforce([check])
        await limiter.enforce([check])
        with pytest.raises(HTTPException) as raised:
            await limiter.enforce([check])
        assert raised.value.status_code == 429

        key = limiter._redis_key(check)
        members = await redis.zrange(key, 0, -1)
        await redis.zadd(key, {member: 0 for member in members})
        await limiter.enforce([check])
    finally:
        await redis.delete(limiter._redis_key(check))
        await redis.aclose()
