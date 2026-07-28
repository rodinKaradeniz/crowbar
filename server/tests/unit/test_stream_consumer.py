import pytest

from app.core import stream_consumer


class _SessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, traceback):
        return False


@pytest.mark.asyncio
async def test_dispatch_invalidates_floor_plan_for_operational_events(monkeypatch):
    calls: list[tuple[str, str]] = []

    async def queue_projection(db, business_id):
        calls.append(("queue", business_id))

    async def order_projection(db, business_id):
        calls.append(("order", business_id))

    async def floor_projection(business_id):
        calls.append(("floor_plan", business_id))

    monkeypatch.setattr(stream_consumer, "async_session", _SessionContext)
    monkeypatch.setattr(stream_consumer, "broadcast_queue_state", queue_projection)
    monkeypatch.setattr(stream_consumer, "broadcast_order_board", order_projection)
    monkeypatch.setattr(
        stream_consumer,
        "broadcast_floor_plan_invalidation",
        floor_projection,
    )

    for event_type in (
        "queue.party_joined",
        "reservation.updated",
        "floor_plan.table.state_changed",
        "order.status_changed",
    ):
        assert await stream_consumer._dispatch(
            {"event_type": event_type, "business_id": "business-1"}
        )

    assert calls == [
        ("queue", "business-1"),
        ("floor_plan", "business-1"),
        ("floor_plan", "business-1"),
        ("floor_plan", "business-1"),
        ("order", "business-1"),
    ]
