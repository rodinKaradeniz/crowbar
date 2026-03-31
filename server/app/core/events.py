"""
Domain event infrastructure.

Usage:
    from app.core.events import publish, DomainEvent

    await publish(DomainEvent(
        event_type="reservation.created",
        business_id=str(reservation.business_id),
        payload={"reservation_id": str(reservation.id), "status": reservation.status},
    ))

Phase 0: events are logged to stdout (structured JSON).
Phase 4: swap publish() to write to Redis Streams — callers do not change.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("slotera.events")


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
        self.location_id = location_id
        self.payload = payload
        self.correlation_id = correlation_id or self.event_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "version": self.version,
            "occurred_at": self.occurred_at,
            "business_id": self.business_id,
            "location_id": self.location_id,
            "payload": self.payload,
            "correlation_id": self.correlation_id,
        }


async def publish(event: DomainEvent) -> None:
    """
    Publish a domain event.

    Phase 0: structured log to stdout.
    Phase 4: replace body with Redis Streams write.
    """
    logger.info("domain_event %s", json.dumps(event.to_dict()))
