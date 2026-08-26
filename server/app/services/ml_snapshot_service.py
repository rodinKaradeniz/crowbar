"""Remembered ML dashboard results, so an optional service going down degrades.

The ML service holds its latest results in process memory, so a restart empties
the Insights page until the next pipeline run. That is acceptable for an
optional feature but not honest: the page went blank without saying why, and a
503 on every panel looks like a Crowbar fault rather than a dependency being
away.

Each successful read is snapshotted per tenant and resource. A later outage
serves the snapshot with `stale: true` and the time it was captured, so an
operator can always tell a remembered number from a live one. A snapshot is
never an input to an operational decision — nothing in the service loop reads
one, and a stale figure carries its own age.
"""

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ml import ML_SNAPSHOT_RESOURCES, MLResultSnapshot


class MLSnapshotError(ValueError):
    pass


def _assert_known(resource: str) -> None:
    if resource not in ML_SNAPSHOT_RESOURCES:
        raise MLSnapshotError(f"Unknown ML resource: {resource}")


async def record(
    db: AsyncSession, business_id: UUID, resource: str, payload: object
) -> None:
    """Remember the latest successful payload for one tenant and resource.

    Upserts rather than appending: the newest result replaces the previous one,
    because a history of dashboard payloads has no reader. A non-dict payload is
    wrapped so the JSONB column always holds an object.
    """
    _assert_known(resource)
    body = payload if isinstance(payload, dict) else {"value": payload}
    now = datetime.now(timezone.utc)

    statement = (
        insert(MLResultSnapshot)
        .values(
            business_id=business_id,
            resource=resource,
            payload=body,
            captured_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_ml_result_snapshots_business_resource",
            set_={"payload": body, "captured_at": now},
        )
    )
    await db.execute(statement)
    await db.commit()


async def latest(
    db: AsyncSession, business_id: UUID, resource: str
) -> MLResultSnapshot | None:
    """The remembered payload, or None if this tenant never had a live result."""
    _assert_known(resource)
    return await db.scalar(
        select(MLResultSnapshot).where(
            MLResultSnapshot.business_id == business_id,
            MLResultSnapshot.resource == resource,
        )
    )


def as_stale_response(snapshot: MLResultSnapshot) -> dict:
    """Shape a snapshot for the client, marked as remembered rather than live."""
    return {
        **snapshot.payload,
        "stale": True,
        "captured_at": snapshot.captured_at.isoformat(),
        "unavailable_reason": "The insights service is unreachable. These are the last results it produced.",
    }


def as_empty_response(resource: str) -> dict:
    """What to show when the service is down and nothing was ever captured.

    An honest empty state rather than a 503: the dashboard is optional, and
    telling an operator "no results yet" is true and actionable, while an error
    page implies Crowbar is broken.
    """
    return {
        "status": "unavailable",
        "stale": True,
        "captured_at": None,
        "unavailable_reason": (
            "The insights service is unreachable and has produced no results for "
            "this venue yet."
        ),
        "resource": resource,
    }
