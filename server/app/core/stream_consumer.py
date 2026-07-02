"""
Redis Stream consumer for WebSocket push.

Reads from the "slotera:events" stream and dispatches events to the appropriate
WebSocket broadcast function. Runs as an asyncio background task started in
the FastAPI lifespan.

Consumer group: ws_push
Consumer name:  worker_1  (single-instance; see backlog for multi-process strategy)

Retry policy: unACK'd messages are re-claimed after RETRY_CLAIM_AFTER_MS and
retried up to MAX_RETRIES times. After that the message is ACK'd and an error
is logged — no dead-letter queue.
"""
import asyncio
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import STREAM_KEY
from app.core.redis_client import get_redis
from app.core.ws_projections import broadcast_order_board, broadcast_queue_state
from app.database import async_session

logger = logging.getLogger("slotera.stream_consumer")

GROUP_NAME = "ws_push"
CONSUMER_NAME = "worker_1"
MAX_RETRIES = 3
RETRY_CLAIM_AFTER_MS = 30_000  # 30 seconds


async def ws_push_consumer() -> None:
    """
    Main consumer loop. Runs until cancelled (FastAPI shutdown).
    Opens its own DB sessions — independent of request sessions.
    """
    r = await get_redis()
    logger.info("stream_consumer: starting (group=%s consumer=%s)", GROUP_NAME, CONSUMER_NAME)

    while True:
        try:
            # Re-claim and retry any stale unACK'd messages
            await _retry_pending(r)

            # Read new messages (block up to 5s per iteration)
            results = await r.xreadgroup(
                GROUP_NAME,
                CONSUMER_NAME,
                {STREAM_KEY: ">"},
                count=10,
                block=5000,
            )

            for _stream, messages in (results or []):
                for msg_id, fields in messages:
                    success = await _dispatch(fields)
                    if success:
                        await r.xack(STREAM_KEY, GROUP_NAME, msg_id)
                    # If not successful: left unACK'd; _retry_pending will re-claim

        except asyncio.CancelledError:
            logger.info("stream_consumer: cancelled, shutting down")
            break
        except Exception:
            logger.exception("stream_consumer: unexpected error in main loop, retrying in 1s")
            await asyncio.sleep(1)


async def _dispatch(fields: dict) -> bool:
    """
    Route event to the correct WS projection. Returns True on success.
    Opens a dedicated DB session scoped to this event.
    """
    event_type = fields.get("event_type", "")
    business_id = fields.get("business_id", "")

    try:
        async with async_session() as db:
            if event_type.startswith("queue."):
                await broadcast_queue_state(db, business_id)
            elif event_type.startswith("order."):
                await broadcast_order_board(db, business_id)
            # inventory.* and reservation.* — no WS push in Phase 4; ACK cleanly
        return True
    except Exception:
        logger.exception(
            "stream_consumer: dispatch failed event_type=%s business_id=%s",
            event_type,
            business_id,
        )
        return False


async def _retry_pending(r) -> None:
    """
    Re-claim messages that have been unACK'd for longer than RETRY_CLAIM_AFTER_MS.
    After MAX_RETRIES deliveries, the message is discarded (ACK'd) with an error log.
    """
    try:
        pending = await r.xpending_range(
            STREAM_KEY,
            GROUP_NAME,
            min="-",
            max="+",
            count=50,
            consumername=CONSUMER_NAME,
        )
    except Exception:
        logger.exception("stream_consumer: failed to fetch pending messages")
        return

    for entry in pending:
        if entry["time_since_delivered"] < RETRY_CLAIM_AFTER_MS:
            continue

        msg_id = entry["message_id"]

        if entry["times_delivered"] >= MAX_RETRIES:
            logger.error(
                "stream_consumer: dropping message after %d retries msg_id=%s",
                MAX_RETRIES,
                msg_id,
            )
            await r.xack(STREAM_KEY, GROUP_NAME, msg_id)
            continue

        # Re-claim and retry
        try:
            claimed = await r.xclaim(
                STREAM_KEY,
                GROUP_NAME,
                CONSUMER_NAME,
                RETRY_CLAIM_AFTER_MS,
                [msg_id],
            )
            for claimed_id, fields in claimed:
                success = await _dispatch(fields)
                if success:
                    await r.xack(STREAM_KEY, GROUP_NAME, claimed_id)
        except Exception:
            logger.exception("stream_consumer: xclaim failed for msg_id=%s", msg_id)
