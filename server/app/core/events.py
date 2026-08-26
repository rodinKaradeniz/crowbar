"""
Domain event infrastructure.

Usage:
    from app.core.events import publish, DomainEvent

    await publish(DomainEvent(
        event_type="reservation.created",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation.id), "status": reservation.status},
    ))

Phase 4: publish() writes to a Redis Stream scoped to the producing database
(see STREAM_KEY below). Callers are unchanged from Phase 0.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from app.config import settings

logger = logging.getLogger("crowbar.events")


def _stream_namespace() -> str:
    """
    Scope the event stream to the database that produced its events.

    One Redis instance is shared by every database this backend is pointed at:
    the dev DB, the ephemeral crowbar_verify_* databases, the pytest database.
    Under a single global stream key, events outlived the tenants they named —
    a verification run seeds businesses with fresh random UUIDs, publishes their
    events, then drops the database, and the next dev boot replays those events
    against a database where the tenants never existed. Keying by database name
    isolates each one without every script having to remember to override
    REDIS_URL.
    """
    return urlparse(settings.database_url).path.lstrip("/") or "unknown"


STREAM_KEY = f"crowbar:events:{_stream_namespace()}"
STREAM_MAXLEN = 10_000


class DomainEvent:
    def __init__(
        self,
        *,
        event_type: str,
        business_id: str,
        payload: dict[str, Any],
        version: int = 1,
        location_id: str | None = None,
        correlation_id: str | None = None,
    ) -> None:
        self.event_id = str(uuid.uuid4())
        self.event_type = event_type
        self.version = version
        self.occurred_at = datetime.now(timezone.utc).isoformat()
        self.business_id = business_id
        self.location_id = location_id or ""
        self.payload = payload
        self.correlation_id = correlation_id or self.event_id

    def to_stream_dict(self) -> dict[str, str]:
        """Flat string dict suitable for Redis XADD. Payload is JSON-encoded."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "version": str(self.version),
            "occurred_at": self.occurred_at,
            "business_id": self.business_id,
            "location_id": self.location_id,
            "payload": json.dumps(self.payload),
            "correlation_id": self.correlation_id,
        }

    def to_dict(self) -> dict[str, Any]:
        """Full dict with payload as a native dict (for logging / non-Redis use)."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "version": self.version,
            "occurred_at": self.occurred_at,
            "business_id": self.business_id,
            "location_id": self.location_id or None,
            "payload": self.payload,
            "correlation_id": self.correlation_id,
        }


async def publish(event: DomainEvent) -> None:
    """
    Publish a domain event to the Redis Stream.
    Errors are logged but never propagate to the caller — a failed publish
    must not crash the HTTP request that triggered the mutation.
    """
    try:
        from app.core.redis_client import get_redis  # local import avoids circular dep at module load
        r = await get_redis()
        await r.xadd(STREAM_KEY, event.to_stream_dict(), maxlen=STREAM_MAXLEN, approximate=True)
        logger.debug("published %s event_id=%s", event.event_type, event.event_id)
    except Exception:
        logger.exception(
            "publish: failed to write event to stream event_type=%s event_id=%s",
            event.event_type,
            event.event_id,
        )
