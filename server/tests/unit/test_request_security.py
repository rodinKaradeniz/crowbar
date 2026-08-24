import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.main import redact_request_path


def test_redacts_credentials_from_legacy_request_paths():
    assert (
        redact_request_path("/api/reservations/public/manage/a-real-secret/cancel")
        == "/api/reservations/public/manage/[redacted]/cancel"
    )
    assert (
        redact_request_path("/api/reservations/waitlist/offers/offer-secret/accept")
        == "/api/reservations/waitlist/offers/[redacted]/accept"
    )


def test_leaves_noncredential_paths_unchanged():
    assert redact_request_path("/api/floor-plan/board") == "/api/floor-plan/board"


@pytest.mark.asyncio
async def test_rejects_streamed_body_over_limit_without_content_length():
    async def oversized_chunks():
        yield b'{"value":"'
        yield b"a" * 1_048_576
        yield b'"}'

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/auth/login",
            content=oversized_chunks(),
            headers={"content-type": "application/json"},
        )

    assert response.status_code == 413
    assert response.json()["code"] == "REQUEST_TOO_LARGE"
