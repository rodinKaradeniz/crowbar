from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.services.websocket_auth import authorize_staff_websocket


@pytest.mark.asyncio
@pytest.mark.parametrize("frame", [[], "authenticate", None, {"type": "wrong"}])
async def test_websocket_rejects_malformed_authentication_frames(frame):
    websocket = AsyncMock()
    websocket.receive_json.return_value = frame

    authorized = await authorize_staff_websocket(
        AsyncMock(),
        websocket,
        business_id=uuid4(),
        required_modules=("ordering",),
    )

    assert authorized is False
    websocket.accept.assert_awaited_once()
    websocket.close.assert_awaited_once_with(code=1008)
    websocket.send_json.assert_not_awaited()
