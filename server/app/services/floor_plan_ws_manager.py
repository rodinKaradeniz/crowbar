import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class FloorPlanConnectionManager:
    """Track staff floor-plan sockets per business for invalidation pushes."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, business_id: str, ws: WebSocket) -> None:
        self._connections[business_id].add(ws)

    def disconnect(self, business_id: str, ws: WebSocket) -> None:
        self._connections[business_id].discard(ws)

    async def broadcast(self, business_id: str, payload: dict) -> None:
        dead: set[WebSocket] = set()
        for ws in list(self._connections.get(business_id, [])):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[business_id].discard(ws)
        logger.debug(
            "floor-plan WS broadcast: business=%s connections=%d",
            business_id,
            len(self._connections.get(business_id, [])),
        )


manager = FloorPlanConnectionManager()
