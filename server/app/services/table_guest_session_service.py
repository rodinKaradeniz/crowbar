import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.table import Table
from app.models.table_guest_session import TableGuestSession
from app.models.table_seating import TableSeating, TableSeatingTable
from app.services import table_qr_service
from app.services.public_session_service import hash_token


MAX_PENDING_SESSIONS_PER_SEATING = 25


class TableGuestSessionError(ValueError):
    pass


async def create_or_refresh(
    db: AsyncSession,
    *,
    business_id: UUID,
    table_token: str,
    browser_nonce: str,
) -> tuple[TableGuestSession, Table, str]:
    table, seating = await table_qr_service.resolve_active_table_seating(
        db, business_id=business_id, token=table_token
    )
    now = datetime.now(timezone.utc)
    nonce_hash = hash_token(browser_nonce)
    await db.execute(
        select(
            func.pg_advisory_xact_lock(
                func.hashtextextended(f"table_guest_session:{seating.id}", 0)
            )
        )
    )
    session = await db.scalar(
        select(TableGuestSession)
        .where(
            TableGuestSession.business_id == business_id,
            TableGuestSession.seating_id == seating.id,
            TableGuestSession.browser_nonce_hash == nonce_hash,
        )
        .with_for_update()
    )
    raw_token = secrets.token_urlsafe(32)
    if session is None:
        pending_count = await db.scalar(
            select(func.count(TableGuestSession.id)).where(
                TableGuestSession.business_id == business_id,
                TableGuestSession.seating_id == seating.id,
                TableGuestSession.status == "pending",
                TableGuestSession.expires_at > now,
            )
        )
        if int(pending_count or 0) >= MAX_PENDING_SESSIONS_PER_SEATING:
            raise TableGuestSessionError(
                "This table has too many pending ordering requests. Ask a staff member for help."
            )
        session = TableGuestSession(
            business_id=business_id,
            location_id=table.location_id,
            table_id=table.id,
            seating_id=seating.id,
            table_qr_revision=table.qr_token_revision,
            browser_nonce_hash=nonce_hash,
            token_hash=hash_token(raw_token),
            status="pending",
            expires_at=now + timedelta(minutes=settings.table_guest_session_ttl_minutes),
        )
        db.add(session)
    else:
        if session.status == "denied" and session.expires_at > now:
            raise TableGuestSessionError(
                "This ordering request was denied. Please ask a staff member for help."
            )
        was_expired = session.expires_at <= now
        session.token_hash = hash_token(raw_token)
        session.table_qr_revision = table.qr_token_revision
        session.expires_at = now + timedelta(
            minutes=settings.table_guest_session_ttl_minutes
        )
        if session.status == "revoked" or was_expired:
            session.status = "pending"
            session.decided_by = None
            session.decided_at = None
    await db.flush()
    return session, table, raw_token


async def resolve_approved(
    db: AsyncSession, *, business_id: UUID, token: str
) -> tuple[TableGuestSession, Table, TableSeating]:
    now = datetime.now(timezone.utc)
    row = await db.execute(
        select(TableGuestSession, Table, TableSeating)
        .join(
            Table,
            (Table.id == TableGuestSession.table_id)
            & (Table.business_id == TableGuestSession.business_id),
        )
        .join(
            TableSeating,
            (TableSeating.id == TableGuestSession.seating_id)
            & (TableSeating.business_id == TableGuestSession.business_id),
        )
        .where(
            TableGuestSession.business_id == business_id,
            TableGuestSession.token_hash == hash_token(token),
            TableGuestSession.status == "approved",
            TableGuestSession.expires_at > now,
            Table.qr_token_revision == TableGuestSession.table_qr_revision,
            Table.is_active.is_(True),
            Table.deleted_at.is_(None),
            TableSeating.status == "open",
        )
    )
    resolved = row.one_or_none()
    if resolved is None:
        raise TableGuestSessionError(
            "Ordering is not approved for this table. Please ask a staff member."
        )
    return resolved


async def get_by_token(
    db: AsyncSession, *, business_id: UUID, token: str
) -> tuple[TableGuestSession, Table] | None:
    row = await db.execute(
        select(TableGuestSession, Table)
        .join(
            Table,
            (Table.id == TableGuestSession.table_id)
            & (Table.business_id == TableGuestSession.business_id),
        )
        .where(
            TableGuestSession.business_id == business_id,
            TableGuestSession.token_hash == hash_token(token),
        )
    )
    return row.one_or_none()


async def list_for_staff(
    db: AsyncSession, *, business_id: UUID, status: str | None = None
) -> list[tuple[TableGuestSession, Table]]:
    query = (
        select(TableGuestSession, Table)
        .join(
            Table,
            (Table.id == TableGuestSession.table_id)
            & (Table.business_id == TableGuestSession.business_id),
        )
        .where(TableGuestSession.business_id == business_id)
        .order_by(TableGuestSession.created_at)
    )
    if status is not None:
        query = query.where(TableGuestSession.status == status)
    return list((await db.execute(query)).all())


async def decide(
    db: AsyncSession,
    *,
    business_id: UUID,
    session_id: UUID,
    actor_id: UUID,
    decision: str,
) -> TableGuestSession:
    if decision not in {"approved", "denied"}:
        raise TableGuestSessionError("Invalid table-session decision")
    session = await db.scalar(
        select(TableGuestSession)
        .where(
            TableGuestSession.id == session_id,
            TableGuestSession.business_id == business_id,
        )
        .with_for_update()
    )
    if session is None:
        raise TableGuestSessionError("Table ordering request not found")
    if session.status != "pending" or session.expires_at <= datetime.now(timezone.utc):
        raise TableGuestSessionError("This table ordering request is no longer pending")
    await resolve_current_authority(db, session)
    session.status = decision
    session.decided_by = actor_id
    session.decided_at = datetime.now(timezone.utc)
    await db.flush()
    return session


async def resolve_current_authority(
    db: AsyncSession, session: TableGuestSession
) -> None:
    current = await db.scalar(
        select(Table.id)
        .join(TableSeatingTable, TableSeatingTable.table_id == Table.id)
        .join(
            TableSeating,
            (TableSeating.id == TableSeatingTable.seating_id)
            & (TableSeating.id == session.seating_id),
        )
        .where(
            Table.id == session.table_id,
            Table.business_id == session.business_id,
            Table.qr_token_revision == session.table_qr_revision,
            Table.is_active.is_(True),
            Table.deleted_at.is_(None),
            TableSeating.business_id == session.business_id,
            TableSeating.status == "open",
        )
    )
    if current is None:
        raise TableGuestSessionError("This table is no longer available for ordering")


async def revoke_for_table(
    db: AsyncSession, *, business_id: UUID, table_id: UUID
) -> None:
    now = datetime.now(timezone.utc)
    await db.execute(
        update(TableGuestSession)
        .where(
            TableGuestSession.business_id == business_id,
            TableGuestSession.table_id == table_id,
            TableGuestSession.status.in_(("pending", "approved")),
        )
        .values(status="revoked", decided_at=now)
    )


async def revoke_for_seating(
    db: AsyncSession, *, business_id: UUID, seating_id: UUID
) -> None:
    now = datetime.now(timezone.utc)
    await db.execute(
        update(TableGuestSession)
        .where(
            TableGuestSession.business_id == business_id,
            TableGuestSession.seating_id == seating_id,
            TableGuestSession.status.in_(("pending", "approved")),
        )
        .values(status="revoked", decided_at=now)
    )
