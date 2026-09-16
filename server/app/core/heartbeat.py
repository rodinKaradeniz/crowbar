"""Liveness heartbeat for live boards.

WHY THIS EXISTS, AND WHY IT TRAVELS THE LONG WAY ROUND.

`events.publish()` logs and swallows a Redis failure on purpose — a failed
publish must not fail the HTTP request that already committed. The cost is that
with Redis stopped a mutation returns 200, the record is correct, and the event
simply never enters the stream: no consumer runs, no frame is sent, and THE
SOCKETS STAY OPEN. `connected` stays true, so the offline bar never appears and
a second operator's board sits unchanged with nothing on screen saying so. That
was the one dependency failure with no signal at all.

A heartbeat sent from the WebSocket endpoint would not have fixed it. It would
prove only that the socket is alive — which was never in doubt — while the
event path behind it was dead. So this beat is published as an ORDINARY DOMAIN
EVENT and delivered by the ordinary consumer: `publish()` → Redis stream →
`ws_push_consumer` → `_dispatch` → the connection managers. Its arrival on a
board therefore proves the whole chain that a real event would have to travel.
Redis down, consumer dead, or the stream unreadable, and the beat stops with it.

The client counts from `lastContactAt`, which every hook already reports and the
offline bar already renders. Nothing new is invented on either side.

SINGLE INSTANCE. Delivery is via a Redis CONSUMER GROUP, so exactly one process
receives each beat. With more than one API process the others' boards would go
quiet and wrongly report themselves stale. That constraint is not new — the
connection managers are in-memory and already documented as single-instance
only (see `queue_ws_manager`) — but the heartbeat inherits it. Recorded in
`docs/TODO.md`.
"""
import asyncio
import logging

from app.core.events import DomainEvent, publish
from app.services.floor_plan_ws_manager import manager as floor_plan_manager
from app.services.order_ws_manager import manager as order_manager
from app.services.queue_ws_manager import manager as queue_manager
from app.services.tab_ws_manager import manager as tab_manager

logger = logging.getLogger("crowbar.heartbeat")

HEARTBEAT_EVENT_TYPE = "system.heartbeat"

#: Seconds between beats. MUST stay below the client's staleness threshold —
#: `LIVENESS_STALE_AFTER_MS` in `client/hooks/socket-status.ts`, which allows
#: three missed beats before it calls a board stale. The two live in different
#: languages and cannot import one another, so changing either means changing
#: both.
HEARTBEAT_INTERVAL_SECONDS = 15

_MANAGERS = (queue_manager, order_manager, tab_manager, floor_plan_manager)


def _anyone_connected() -> bool:
    return any(m.connected_business_ids() for m in _MANAGERS)


async def liveness_heartbeat() -> None:
    """Publish a liveness beat while any board is watching. Runs until cancelled."""
    logger.info("heartbeat: starting (interval=%ss)", HEARTBEAT_INTERVAL_SECONDS)
    while True:
        try:
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)
            # Nothing to tell a room nobody is in — and this keeps the beat off
            # the stream entirely on an idle instance.
            if not _anyone_connected():
                continue
            await publish(
                DomainEvent(
                    event_type=HEARTBEAT_EVENT_TYPE,
                    business_id="",
                    payload={},
                )
            )
        except asyncio.CancelledError:
            logger.info("heartbeat: stopping")
            raise
        except Exception:
            # Never let the beat's own failure end the loop; the board treating
            # itself as stale is the correct outcome either way.
            logger.exception("heartbeat: publish failed")
