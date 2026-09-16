"""
WebSocket projection helpers.

These functions re-fetch current domain state from the DB and broadcast it to
connected WebSocket clients. They are called by the stream consumer (Phase 4)
rather than directly from routers.

Previously these were private `_broadcast_queue()` / `_broadcast_orders()`
helpers inline in the routers. Extracting them here breaks the import cycle
and makes them available to the consumer without importing the routers.
"""
import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from fastapi.encoders import jsonable_encoder
from app.services import order_service, queue_service
from app.services.floor_plan_ws_manager import manager as floor_plan_manager
from app.services.order_ws_manager import manager as order_manager
from app.services.queue_ws_manager import manager as queue_manager
from app.services.tab_ws_manager import manager as tab_manager

logger = logging.getLogger(__name__)


async def broadcast_floor_plan_invalidation(business_id: str) -> None:
    """Tell host boards to re-fetch their authoritative HTTP projection."""
    await floor_plan_manager.broadcast(
        business_id,
        {"type": "floor_plan_updated"},
    )


async def broadcast_tab_invalidation(business_id: str) -> None:
    await tab_manager.broadcast(business_id, {"type": "tabs_invalidated"})


async def broadcast_queue_state(db: AsyncSession, business_id: str) -> None:
    """Re-fetch all active queue entries and broadcast the current state."""
    biz_uuid = UUID(business_id)
    entries = await queue_service.get_active_entries(db, biz_uuid)
    waiting_pos = 1
    payload_entries = []
    for e in entries:
        pos = waiting_pos if e.status == "waiting" else None
        if e.status == "waiting":
            waiting_pos += 1
        payload_entries.append(await queue_service.entry_to_dict(db, e, pos))
    # jsonable_encoder for the same reason as the queue WS handler in
    # routers/queue.py: `entry_to_dict` yields date/datetime values and
    # `manager.broadcast` json.dumps them. Here the TypeError was quieter still
    # — broadcast catches every exception per socket and simply drops that
    # socket as dead, so a live board went silent with no error anywhere.
    await queue_manager.broadcast(
        business_id,
        jsonable_encoder({"type": "queue_updated", "entries": payload_entries}),
    )
    logger.debug("broadcast_queue_state: business=%s entries=%d", business_id, len(payload_entries))


async def broadcast_order_board(db: AsyncSession, business_id: str) -> None:
    """Re-fetch all active orders and broadcast the current board state."""
    biz_uuid = UUID(business_id)
    orders = await order_service.get_orders_for_board(db, biz_uuid)
    payload = await order_service.orders_to_board_payload(db, biz_uuid, orders)
    await order_manager.broadcast(
        business_id, {"type": "order_updated", "orders": payload}
    )
    logger.debug("broadcast_order_board: business=%s orders=%d", business_id, len(payload))


async def broadcast_liveness() -> None:
    """Deliver one liveness beat to every board this process is serving.

    Carries no data: its ARRIVAL is the whole message. Each hook records it as
    contact and does not treat it as an update, so it costs no refetch.
    See `app/core/heartbeat.py` for why it comes the long way round.
    """
    frame = {"type": "heartbeat"}
    for manager in (queue_manager, order_manager, tab_manager, floor_plan_manager):
        for business_id in manager.connected_business_ids():
            await manager.broadcast(business_id, frame)
