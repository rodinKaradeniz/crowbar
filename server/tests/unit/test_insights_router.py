import httpx
import pytest

from app.config import settings
from app.routers import insights


class FakeResponse:
    is_error = False

    def json(self):
        return {"status": "ok"}


class FakeAsyncClient:
    last_request: tuple[str, str, dict[str, str]] | None = None

    def __init__(self, timeout: float):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return None

    async def request(self, method: str, url: str, headers: dict[str, str]):
        self.__class__.last_request = (method, url, headers)
        return FakeResponse()


@pytest.mark.asyncio
async def test_gateway_scopes_private_ml_request_to_authenticated_business(
    monkeypatch,
):
    monkeypatch.setattr(settings, "ml_service_url", "http://ml.railway.internal:8001")
    monkeypatch.setattr(settings, "ml_internal_token", "shared-secret")
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    result = await insights._request_ml("GET", "business-123", "status")

    assert result == {"status": "ok"}
    assert FakeAsyncClient.last_request == (
        "GET",
        "http://ml.railway.internal:8001/businesses/business-123/status",
        {"X-ML-Internal-Token": "shared-secret"},
    )
