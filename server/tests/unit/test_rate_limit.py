from collections.abc import Awaitable, Callable

import pytest
from fastapi import HTTPException, Request
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core.rate_limit import (
    RateLimitCheck,
    RateLimitPolicy,
    RateLimiter,
    get_client_ip,
)


class StubRedis:
    def __init__(
        self,
        *,
        results: list[list[int]] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.results = list(results or [[1, 1, 0]])
        self.error = error
        self.calls: list[tuple] = []

    async def eval(self, *args):
        self.calls.append(args)
        if self.error is not None:
            raise self.error
        if len(self.results) == 1:
            return self.results[0]
        return self.results.pop(0)


def _provider(redis: StubRedis) -> Callable[[], Awaitable[StubRedis]]:
    async def provide() -> StubRedis:
        return redis

    return provide


def _request(
    *,
    direct_ip: str = "127.0.0.1",
    real_ip: str | None = None,
    path: str = "/api/example",
) -> Request:
    headers = []
    if real_ip is not None:
        headers.append((b"x-real-ip", real_ip.encode("ascii")))
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "query_string": b"",
            "headers": headers,
            "client": (direct_ip, 12345),
            "server": ("test", 80),
            "scheme": "http",
        }
    )


def test_get_client_ip_only_trusts_proxy_header_when_configured():
    request = _request(direct_ip="10.0.0.5", real_ip="203.0.113.9")

    assert get_client_ip(request, trust_proxy_headers=False) == "10.0.0.5"
    assert get_client_ip(request, trust_proxy_headers=True) == "203.0.113.9"


def test_get_client_ip_rejects_invalid_proxy_value():
    request = _request(direct_ip="10.0.0.5", real_ip="not-an-ip")

    assert get_client_ip(request, trust_proxy_headers=True) == "10.0.0.5"


@pytest.mark.asyncio
async def test_disabled_limiter_does_not_connect_to_redis():
    provider_called = False

    async def provider():
        nonlocal provider_called
        provider_called = True
        return StubRedis()

    limiter = RateLimiter(
        redis_provider=provider,
        enabled_provider=lambda: False,
    )

    await limiter.enforce(
        [RateLimitCheck(RateLimitPolicy("disabled", 1, 60), ("client",))]
    )

    assert provider_called is False


@pytest.mark.asyncio
async def test_identifiers_are_hmac_hashed_before_reaching_redis():
    redis = StubRedis()
    limiter = RateLimiter(
        redis_provider=_provider(redis),
        enabled_provider=lambda: True,
    )
    raw_email = "person@example.com"
    raw_phone = "+15551234567"

    await limiter.enforce(
        [
            RateLimitCheck(
                RateLimitPolicy("privacy", 5, 60),
                ("203.0.113.9", raw_email, raw_phone),
            )
        ]
    )

    redis_key = redis.calls[0][2]
    assert redis_key.startswith("crowbar:rate_limit:privacy:")
    assert raw_email not in redis_key
    assert raw_phone not in redis_key
    assert "203.0.113.9" not in redis_key


@pytest.mark.asyncio
async def test_blocked_request_has_standard_error_and_retry_after():
    redis = StubRedis(results=[[0, 10, 42]])
    limiter = RateLimiter(
        redis_provider=_provider(redis),
        enabled_provider=lambda: True,
    )
    policy = RateLimitPolicy("blocked", 10, 600)

    with pytest.raises(HTTPException) as raised:
        await limiter.enforce([RateLimitCheck(policy, ("client",))])

    assert raised.value.status_code == 429
    assert raised.value.headers == {"Retry-After": "42"}
    assert raised.value.detail == {
        "code": "RATE_LIMITED",
        "message": "Too many requests. Please try again later.",
        "details": {
            "policy": "blocked",
            "limit": 10,
            "window_seconds": 600,
        },
    }


@pytest.mark.asyncio
async def test_redis_failure_fails_open_and_throttles_warning_logs(caplog):
    redis = StubRedis(error=RedisConnectionError("redis unavailable"))
    limiter = RateLimiter(
        redis_provider=_provider(redis),
        enabled_provider=lambda: True,
        failure_log_interval_seconds=60,
    )
    check = RateLimitCheck(RateLimitPolicy("fail_open", 1, 60), ("client",))

    with caplog.at_level("WARNING"):
        await limiter.enforce([check])
        await limiter.enforce([check])

    warnings = [
        record
        for record in caplog.records
        if "rate_limit backend_unavailable action=fail_open" in record.message
    ]
    assert len(warnings) == 1


def test_policy_rejects_non_positive_limits_and_windows():
    with pytest.raises(ValueError):
        RateLimitPolicy("no_requests", 0, 60)
    with pytest.raises(ValueError):
        RateLimitPolicy("no_window", 1, 0)
