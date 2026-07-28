import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import DomainEvent, publish
from app.core.rate_limit import (
    PUBLIC_IDENTITY_WRITE_LIMIT,
    PUBLIC_WRITE_IP_LIMIT,
    RateLimitCheck,
    enforce_public_read_limit,
    enforce_rate_limits,
    get_client_ip,
)
from app.database import get_db
from app.dependencies import get_current_user, get_current_business, require_module
from app.models.business import Business
from app.models.user import User
from app.schemas.queue_entry import QueueEntryResponse, QueueJoinRequest, QueueStatusResponse
from app.services import notification_service, queue_service
from app.services.queue_ws_manager import manager
from app.services.websocket_auth import authorize_staff_websocket

logger = logging.getLogger(__name__)

router = APIRouter(tags=["queue"])


# ─── helpers ──────────────────────────────────────────────────────────────────

def _build_entry_response(entry_dict: dict) -> QueueEntryResponse:
    return QueueEntryResponse(**entry_dict)


def _get_business_id_or_404(business_id_str: str) -> UUID:
    try:
        return UUID(business_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")


async def _load_business_or_404(db: AsyncSession, business_id: UUID) -> Business:
    result = await db.execute(select(Business).where(Business.id == business_id))
    b = result.scalar_one_or_none()
    if b is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    return b


# ─── public endpoints ──────────────────────────────────────────────────────────

@router.post("/api/queue/{business_id}/join", response_model=QueueStatusResponse)
async def join_queue(
    business_id: UUID,
    body: QueueJoinRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_ip = get_client_ip(request)
    checks = [
        RateLimitCheck(
            policy=PUBLIC_WRITE_IP_LIMIT,
            key_parts=("queue_join", str(business_id), client_ip),
        ),
    ]
    if body.phone:
        checks.append(
            RateLimitCheck(
                policy=PUBLIC_IDENTITY_WRITE_LIMIT,
                key_parts=(
                    "queue_join",
                    str(business_id),
                    body.phone.strip(),
                ),
            )
        )
    await enforce_rate_limits(*checks)

    # Verify business exists
    await _load_business_or_404(db, business_id)

    status_dict = await queue_service.join_queue(
        db, business_id, body.name, body.party_size, body.phone
    )

    party_label = f"party of {body.party_size}" if body.party_size > 1 else "1 guest"
    await notification_service.notify_business_staff(
        db,
        business_id=business_id,
        kind="queue_join",
        title=f"{body.name} joined the queue",
        body=f"{body.name} ({party_label}) is waiting.",
        payload={"entry_id": str(status_dict["entry"]["id"])},
    )

    await db.commit()

    await publish(DomainEvent(
        event_type="queue.party_joined",
        business_id=str(business_id),
        payload={
            "entry_id": str(status_dict["entry"]["id"]),
            "party_size": body.party_size,
        },
    ))

    return QueueStatusResponse(
        entry=QueueEntryResponse(**status_dict["entry"]),
        total_waiting=status_dict["total_waiting"],
        estimated_wait_minutes=status_dict["estimated_wait_minutes"],
    )


@router.post("/api/queue/{business_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_queue(
    business_id: UUID,
    request: Request,
    session_token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Customer-initiated removal from the queue using their session token."""
    await enforce_rate_limits(
        RateLimitCheck(
            policy=PUBLIC_WRITE_IP_LIMIT,
            key_parts=(
                "queue_leave",
                str(business_id),
                get_client_ip(request),
            ),
        ),
        RateLimitCheck(
            policy=PUBLIC_IDENTITY_WRITE_LIMIT,
            key_parts=("queue_leave", str(business_id), session_token),
        ),
    )

    entry = await queue_service.remove_by_token(db, business_id, session_token)
    if entry is None:
        # Entry not found or already inactive — treat as success (idempotent)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    await notification_service.notify_business_staff(
        db,
        business_id=business_id,
        kind="queue_leave",
        title=f"{entry.name} left the queue",
        body=f"{entry.name} (party of {entry.party_size}) removed themselves from the queue.",
        payload={"entry_id": str(entry.id)},
    )

    await db.commit()

    await publish(DomainEvent(
        event_type="queue.party_removed",
        business_id=str(business_id),
        payload={"entry_id": str(entry.id)},
    ))

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/queue/{business_id}/status",
    response_model=QueueStatusResponse,
    dependencies=[Depends(enforce_public_read_limit)],
)
async def get_queue_status(
    business_id: UUID,
    session_token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    status_dict = await queue_service.get_status_by_token(db, business_id, session_token)
    if status_dict is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Queue entry not found")
    return QueueStatusResponse(
        entry=QueueEntryResponse(**status_dict["entry"]),
        total_waiting=status_dict["total_waiting"],
        estimated_wait_minutes=status_dict["estimated_wait_minutes"],
    )


# ─── staff endpoints ───────────────────────────────────────────────────────────

@router.get(
    "/api/queue/{business_id}/entries",
    response_model=list[QueueEntryResponse],
    dependencies=[Depends(require_module("queue"))],
)
async def list_queue_entries(
    business_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    entries = await queue_service.get_active_entries(db, business_id)
    waiting_pos = 1
    result = []
    for e in entries:
        pos = waiting_pos if e.status == "waiting" else None
        if e.status == "waiting":
            waiting_pos += 1
        result.append(QueueEntryResponse(**queue_service.entry_to_dict(e, pos)))
    return result


@router.post(
    "/api/queue/{business_id}/entries/{entry_id}/notify",
    response_model=QueueEntryResponse,
    dependencies=[Depends(require_module("queue"))],
)
async def notify_queue_entry(
    business_id: UUID,
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    """Notify the party (SMS if phone provided) and move them to 'called' status."""
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    entry = await queue_service.call_entry(db, business_id, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found or not in waiting status")

    await notification_service.notify_business_staff(
        db,
        business_id=business_id,
        kind="queue_called",
        title=f"{entry.name} has been notified",
        body=f"{entry.name} (party of {entry.party_size}) was called — waiting for arrival.",
        payload={"entry_id": str(entry.id)},
        exclude_user_id=current_user.id,
    )

    await db.commit()

    await publish(DomainEvent(
        event_type="queue.party_called",
        business_id=str(business_id),
        payload={"entry_id": str(entry.id)},
    ))

    return QueueEntryResponse(**queue_service.entry_to_dict(entry))


@router.post(
    "/api/queue/{business_id}/entries/{entry_id}/accept",
    response_model=QueueEntryResponse,
    dependencies=[Depends(require_module("queue"))],
)
async def accept_queue_entry(
    business_id: UUID,
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    """Accept a waiting party directly — seat them immediately without notifying."""
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    entry = await queue_service.accept_entry(db, business_id, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found or not in waiting status")

    await notification_service.notify_business_staff(
        db,
        business_id=business_id,
        kind="queue_accepted",
        title=f"{entry.name} has been seated",
        body=f"{entry.name} (party of {entry.party_size}) was admitted directly.",
        payload={"entry_id": str(entry.id)},
        exclude_user_id=current_user.id,
    )

    await db.commit()

    await publish(DomainEvent(
        event_type="queue.party_accepted",
        business_id=str(business_id),
        payload={"entry_id": str(entry.id)},
    ))

    return QueueEntryResponse(**queue_service.entry_to_dict(entry))


@router.post(
    "/api/queue/{business_id}/entries/{entry_id}/seat",
    response_model=QueueEntryResponse,
    dependencies=[Depends(require_module("queue"))],
)
async def seat_queue_entry(
    business_id: UUID,
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    entry = await queue_service.seat_entry(db, business_id, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found or not in called status")

    await db.commit()

    await publish(DomainEvent(
        event_type="queue.party_seated",
        business_id=str(business_id),
        payload={"entry_id": str(entry.id)},
    ))

    return QueueEntryResponse(**queue_service.entry_to_dict(entry))


@router.delete(
    "/api/queue/{business_id}/entries/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_module("queue"))],
)
async def remove_queue_entry(
    business_id: UUID,
    entry_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    business: Business = Depends(get_current_business),
):
    if business.id != business_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    removed = await queue_service.remove_entry(db, business_id, entry_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found or already inactive")

    await db.commit()

    await publish(DomainEvent(
        event_type="queue.party_removed",
        business_id=str(business_id),
        payload={"entry_id": str(entry_id)},
    ))

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ─── WebSocket ─────────────────────────────────────────────────────────────────

@router.websocket("/ws/queue/{business_id}")
async def queue_websocket(
    business_id: UUID,
    ws: WebSocket,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Staff WebSocket authenticated by a short-lived, scoped credential."""
    if not await authorize_staff_websocket(
        db,
        ws,
        token=token,
        business_id=business_id,
        required_modules=("queue",),
    ):
        return

    bid = str(business_id)
    await manager.connect(bid, ws)

    # Send current queue state immediately on connect
    entries = await queue_service.get_active_entries(db, business_id)
    waiting_pos = 1
    payload_entries = []
    for e in entries:
        pos = waiting_pos if e.status == "waiting" else None
        if e.status == "waiting":
            waiting_pos += 1
        payload_entries.append(queue_service.entry_to_dict(e, pos))

    try:
        await ws.send_json({"type": "queue_updated", "entries": payload_entries})
        async for _ in ws.iter_text():
            pass  # keep connection alive; clients only receive, not send
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(bid, ws)
