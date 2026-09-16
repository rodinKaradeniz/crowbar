"""The liveness beat must travel the event path, not shortcut it.

Redis loss was the one dependency failure with no signal: `publish()` logs and
swallows by design, so no event reaches the stream, no consumer runs, no frame
is sent — and the sockets stay OPEN, so `connected` stayed true and the offline
bar never appeared. A beat sent from the WebSocket endpoint would have proved
only that the socket was alive, which was never in doubt.
"""
import pytest

from app.core import heartbeat
from app.core.stream_consumer import _dispatch


class _FakeManager:
    def __init__(self, connections: dict[str, int]) -> None:
        self._conns = connections
        self.sent: list[tuple[str, dict]] = []

    def connected_business_ids(self) -> list[str]:
        return [bid for bid, n in self._conns.items() if n]

    async def broadcast(self, business_id: str, payload: dict) -> None:
        self.sent.append((business_id, payload))


@pytest.mark.asyncio
async def test_heartbeat_reaches_boards_through_the_consumer(monkeypatch):
    """`_dispatch` is the far end of the Redis chain — arriving there is the proof."""
    manager = _FakeManager({"biz-1": 1, "biz-2": 2, "biz-empty": 0})
    for name in (
        "queue_manager",
        "order_manager",
        "tab_manager",
        "floor_plan_manager",
    ):
        monkeypatch.setattr(f"app.core.ws_projections.{name}", manager)

    acked = await _dispatch(
        {"event_type": heartbeat.HEARTBEAT_EVENT_TYPE, "business_id": ""}
    )

    assert acked is True
    # Four managers x the two businesses that actually have a socket.
    assert len(manager.sent) == 8
    assert {bid for bid, _ in manager.sent} == {"biz-1", "biz-2"}
    assert all(payload == {"type": "heartbeat"} for _, payload in manager.sent)


@pytest.mark.asyncio
async def test_no_beat_is_published_when_no_board_is_watching(monkeypatch):
    """An idle instance keeps the beat off the stream entirely."""
    empty = _FakeManager({})
    monkeypatch.setattr(heartbeat, "_MANAGERS", (empty,))
    assert heartbeat._anyone_connected() is False

    watching = _FakeManager({"biz-1": 1})
    monkeypatch.setattr(heartbeat, "_MANAGERS", (empty, watching))
    assert heartbeat._anyone_connected() is True


@pytest.mark.asyncio
async def test_the_client_threshold_leaves_room_for_missed_beats():
    """Guards the cross-language coupling this design depends on.

    `LIVENESS_STALE_AFTER_MS` in `client/hooks/socket-status.ts` must stay
    comfortably above the server interval, or a board calls itself stale
    between two healthy beats.
    """
    import pathlib
    import re

    source = (
        pathlib.Path(__file__).resolve().parents[2].parent
        / "client"
        / "hooks"
        / "socket-status.ts"
    ).read_text()
    match = re.search(r"LIVENESS_STALE_AFTER_MS = ([0-9_]+)", source)
    assert match, "client threshold not found — the coupling is undocumented"
    client_ms = int(match.group(1).replace("_", ""))
    assert client_ms >= heartbeat.HEARTBEAT_INTERVAL_SECONDS * 1000 * 2
