"""Route-level verification for the standardized rate-limit response."""

import pytest
from httpx import AsyncClient

from app.config import settings
from app.core import rate_limit as rate_limit_module


class BlockingRedis:
    async def eval(self, *args):
        return [0, 50, 37]


@pytest.mark.asyncio
async def test_login_rate_limit_returns_429_with_retry_after(
    client: AsyncClient,
    monkeypatch,
):
    async def provider():
        return BlockingRedis()

    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(rate_limit_module.rate_limiter, "_redis_provider", provider)

    response = await client.post(
        "/api/auth/login",
        json={"email": "limited@example.com", "password": "wrong"},
    )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "37"
    assert response.json() == {
        "code": "RATE_LIMITED",
        "message": "Too many requests. Please try again later.",
        "details": {
            "policy": "auth_login_ip",
            "limit": 50,
            "window_seconds": 600,
        },
    }
