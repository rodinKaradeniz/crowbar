import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class QueueConnectionManager:
    """In-memory WebSocket manager scoped per business_id.

    Suitable for single-instance deployments. For horizontal scaling,
    replace broadcast() with Redis pub/sub (tracked in backlog).
    """

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, business_id: str, ws: WebSocket) -> None:
        self._connections[business_id].add(ws)
        logger.debug("WS connected: business=%s total=%d", business_id, len(self._connections[business_id]))

    def disconnect(self, business_id: str, ws: WebSocket) -> None:
        self._connections[business_id].discard(ws)
        logger.debug("WS disconnected: business=%s total=%d", business_id, len(self._connections[business_id]))

    async def broadcast(self, business_id: str, payload: dict) -> None:
        dead: set[WebSocket] = set()
        for ws in list(self._connections.get(business_id, [])):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[business_id].discard(ws)


# Module-level singleton
manager = QueueConnectionManager()
