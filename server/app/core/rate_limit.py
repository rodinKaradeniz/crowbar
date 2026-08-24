"""Redis-backed application rate limiting for public and authentication routes."""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import logging
import time
import uuid
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass

import redis.asyncio as aioredis
from fastapi import Request, status
from redis.exceptions import RedisError

from app.config import settings
from app.core.errors import ErrorCode, api_error
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


# Redis provides the clock so every API replica applies the same rolling window.
# Raw identifiers never enter Redis; callers supply key material which is HMACed.
_SLIDING_WINDOW_SCRIPT = """
local redis_time = redis.call("TIME")
local now_ms = (tonumber(redis_time[1]) * 1000) + math.floor(tonumber(redis_time[2]) / 1000)
local window_ms = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local member = ARGV[3]
local cutoff_ms = now_ms - window_ms

redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, cutoff_ms)
local count = redis.call("ZCARD", KEYS[1])

if count >= limit then
    local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
    local retry_after = 1
    if oldest[2] then
        retry_after = math.max(
            1,
            math.ceil((tonumber(oldest[2]) + window_ms - now_ms) / 1000)
        )
    end
    redis.call("PEXPIRE", KEYS[1], window_ms)
    return {0, count, retry_after}
end

redis.call("ZADD", KEYS[1], now_ms, member)
redis.call("PEXPIRE", KEYS[1], window_ms)
return {1, count + 1, 0}
"""


@dataclass(frozen=True)
class RateLimitPolicy:
    name: str
    limit: int
    window_seconds: int

    def __post_init__(self) -> None:
        if self.limit < 1:
            raise ValueError("Rate-limit policy limit must be positive")
        if self.window_seconds < 1:
            raise ValueError("Rate-limit policy window must be positive")


@dataclass(frozen=True)
class RateLimitCheck:
    policy: RateLimitPolicy
    key_parts: tuple[str, ...]


# Authentication policies.
LOGIN_IDENTITY_LIMIT = RateLimitPolicy(
    name="auth_login_identity",
    limit=10,
    window_seconds=10 * 60,
)
LOGIN_IP_LIMIT = RateLimitPolicy(
    name="auth_login_ip",
    limit=50,
    window_seconds=10 * 60,
)
ACCOUNT_REGISTRATION_IP_LIMIT = RateLimitPolicy(
    name="auth_registration_ip",
    limit=5,
    window_seconds=60 * 60,
)
INVITE_ACCEPT_IP_LIMIT = RateLimitPolicy(
    name="auth_invite_accept_ip",
    limit=5,
    window_seconds=60 * 60,
)
PASSWORD_RESET_IP_LIMIT = RateLimitPolicy(
    name="auth_password_reset_ip",
    limit=10,
    window_seconds=60 * 60,
)
PASSWORD_RESET_IDENTITY_LIMIT = RateLimitPolicy(
    name="auth_password_reset_identity",
    limit=3,
    window_seconds=60 * 60,
)

# Public guest policies. Generous IP ceilings avoid penalizing venue Wi-Fi NAT.
PUBLIC_IDENTITY_WRITE_LIMIT = RateLimitPolicy(
    name="public_identity_write",
    limit=5,
    window_seconds=30 * 60,
)
PUBLIC_WRITE_IP_LIMIT = RateLimitPolicy(
    name="public_write_ip",
    limit=60,
    window_seconds=10 * 60,
)
PUBLIC_ORDER_IP_LIMIT = RateLimitPolicy(
    name="public_order_ip",
    limit=120,
    window_seconds=10 * 60,
)
PUBLIC_READ_LIMIT = RateLimitPolicy(
    name="public_read",
    limit=300,
    window_seconds=60,
)
PUBLIC_CAPABILITY_READ_LIMIT = RateLimitPolicy(
    name="public_capability_read",
    limit=180,
    window_seconds=60,
)


RedisProvider = Callable[[], Awaitable[aioredis.Redis]]
EnabledProvider = Callable[[], bool]


def _normalized_ip(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return ipaddress.ip_address(value.strip()).compressed
    except ValueError:
        return None


def get_client_ip(
    request: Request,
    *,
    trust_proxy_headers: bool | None = None,
) -> str:
    """Resolve a stable client address without trusting spoofable local headers."""
    should_trust_proxy = (
        settings.environment == "production"
        if trust_proxy_headers is None
        else trust_proxy_headers
    )
    if should_trust_proxy:
        forwarded = _normalized_ip(request.headers.get("x-real-ip"))
        if forwarded:
            return forwarded

    direct = _normalized_ip(request.client.host if request.client else None)
    return direct or "unknown"


def public_read_check(request: Request) -> RateLimitCheck:
    """Build the per-IP public read key without reading credentials from URLs."""
    return RateLimitCheck(
        policy=PUBLIC_READ_LIMIT,
        key_parts=(
            get_client_ip(request),
            request.url.path,
        ),
    )


def public_capability_checks(request: Request) -> list[RateLimitCheck]:
    """Bound each purpose-scoped capability independently of a shared IP."""
    return [
        RateLimitCheck(
            policy=PUBLIC_CAPABILITY_READ_LIMIT,
            key_parts=(cookie_key, cookie_value, request.url.path),
        )
        for cookie_key, cookie_value in sorted(request.cookies.items())
        if cookie_value
        and (
            cookie_key.startswith("crowbar-")
            or cookie_key.startswith("__Host-crowbar-")
        )
    ]


class RateLimiter:
    def __init__(
        self,
        *,
        redis_provider: RedisProvider = get_redis,
        enabled_provider: EnabledProvider | None = None,
        failure_log_interval_seconds: float = 60.0,
    ) -> None:
        self._redis_provider = redis_provider
        self._enabled_provider = enabled_provider or (
            lambda: settings.rate_limit_enabled
        )
        self._failure_log_interval_seconds = failure_log_interval_seconds
        self._last_failure_log_at = 0.0

    def _redis_key(self, check: RateLimitCheck) -> str:
        material = "\x1f".join(str(part) for part in check.key_parts)
        digest = hmac.new(
            settings.rate_limit_hmac_secret.encode("utf-8"),
            material.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return f"crowbar:rate_limit:{check.policy.name}:{digest}"

    def _log_backend_failure(self, exc: Exception) -> None:
        now = time.monotonic()
        if now - self._last_failure_log_at < self._failure_log_interval_seconds:
            return
        self._last_failure_log_at = now
        logger.warning(
            "rate_limit backend_unavailable action=fail_open error_type=%s",
            type(exc).__name__,
        )

    async def enforce(self, checks: Iterable[RateLimitCheck]) -> None:
        if not self._enabled_provider():
            return

        try:
            redis = await self._redis_provider()
            for check in checks:
                key = self._redis_key(check)
                result = await redis.eval(
                    _SLIDING_WINDOW_SCRIPT,
                    1,
                    key,
                    check.policy.window_seconds * 1000,
                    check.policy.limit,
                    uuid.uuid4().hex,
                )
                allowed = bool(int(result[0]))
                if allowed:
                    continue

                retry_after = max(1, int(result[2]))
                raise api_error(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    ErrorCode.RATE_LIMITED,
                    "Too many requests. Please try again later.",
                    {
                        "policy": check.policy.name,
                        "limit": check.policy.limit,
                        "window_seconds": check.policy.window_seconds,
                    },
                    headers={"Retry-After": str(retry_after)},
                )
        except (RedisError, OSError) as exc:
            # Rate limiting is a protective layer, not a core dependency. Keep
            # reservations and ordering available during a Redis incident.
            self._log_backend_failure(exc)


rate_limiter = RateLimiter()


async def enforce_rate_limits(*checks: RateLimitCheck) -> None:
    await rate_limiter.enforce(checks)


async def enforce_public_read_limit(request: Request) -> None:
    await enforce_rate_limits(
        public_read_check(request),
        *public_capability_checks(request),
    )
