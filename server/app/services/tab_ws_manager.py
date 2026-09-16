from collections import defaultdict

from fastapi import WebSocket


class TabConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, business_id: str, websocket: WebSocket) -> None:
        self.active[business_id].append(websocket)

    def disconnect(self, business_id: str, websocket: WebSocket) -> None:
        if websocket in self.active.get(business_id, []):
            self.active[business_id].remove(websocket)

    def connected_business_ids(self) -> list[str]:
        """Businesses with at least one live socket on THIS process.

        Used by the liveness heartbeat: there is nothing to tell a business
        nobody is watching. `active` is a defaultdict, so a business that has
        disconnected can still hold an empty list — filter, do not just take
        the keys. (This manager stores `active: dict[str, list]` where its three
        siblings store `_connections: dict[str, set]`.)
        """
        return [bid for bid, conns in self.active.items() if conns]

    async def broadcast(self, business_id: str, payload: dict) -> None:
        stale = []
        for websocket in list(self.active.get(business_id, [])):
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(business_id, websocket)


manager = TabConnectionManager()
