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

from app.services import order_service, queue_service
from app.services.order_ws_manager import manager as order_manager
from app.services.queue_ws_manager import manager as queue_manager

logger = logging.getLogger(__name__)


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
        payload_entries.append(queue_service.entry_to_dict(e, pos))
    await queue_manager.broadcast(
        business_id, {"type": "queue_updated", "entries": payload_entries}
    )
    logger.debug("broadcast_queue_state: business=%s entries=%d", business_id, len(payload_entries))


async def broadcast_order_board(db: AsyncSession, business_id: str) -> None:
    """Re-fetch all active orders and broadcast the current board state."""
    biz_uuid = UUID(business_id)
    orders = await order_service.get_orders_for_board(db, biz_uuid)
    payload = [order_service.order_to_dict(o) for o in orders]
    await order_manager.broadcast(
        business_id, {"type": "order_updated", "orders": payload}
    )
    logger.debug("broadcast_order_board: business=%s orders=%d", business_id, len(payload))
