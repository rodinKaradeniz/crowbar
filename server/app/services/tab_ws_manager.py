from collections import defaultdict

from fastapi import WebSocket


class TabConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, business_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active[business_id].append(websocket)

    def disconnect(self, business_id: str, websocket: WebSocket) -> None:
        if websocket in self.active.get(business_id, []):
            self.active[business_id].remove(websocket)

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
