"""Opaque, revisioned QR credentials for registered dine-in tables."""

import base64
import hashlib
import hmac
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.table import Table
from app.models.table_seating import TableSeating, TableSeatingTable


class TableQrError(ValueError):
    pass


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_table_token(table: Table) -> str:
    """Sign identity plus the table's mutable revision; labels never enter it."""
    payload = f"v1.{table.business_id}.{table.id}.{table.qr_token_revision}".encode()
    encoded = _encode(payload)
    signature = hmac.new(
        settings.secret_key.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{encoded}.{_encode(signature)}"


def _parse_table_token(token: str) -> tuple[UUID, UUID, int]:
    try:
        encoded, provided_signature = token.split(".", 1)
        expected = hmac.new(
            settings.secret_key.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, _decode(provided_signature)):
            raise TableQrError("This table QR code is no longer valid")
        version, business_id, table_id, revision = _decode(encoded).decode().split(".")
        if version != "v1":
            raise TableQrError("This table QR code is no longer valid")
        return UUID(business_id), UUID(table_id), int(revision)
    except (ValueError, UnicodeDecodeError, TypeError) as exc:
        if isinstance(exc, TableQrError):
            raise
        raise TableQrError("This table QR code is invalid") from exc


async def resolve_active_table_seating(
    db: AsyncSession, *, business_id: UUID, token: str
) -> tuple[Table, TableSeating]:
    token_business_id, table_id, revision = _parse_table_token(token)
    if token_business_id != business_id:
        raise TableQrError("This table QR code is invalid for this venue")
    table = await db.scalar(
        select(Table).where(
            Table.id == table_id,
            Table.business_id == business_id,
            Table.qr_token_revision == revision,
            Table.is_active.is_(True),
            Table.deleted_at.is_(None),
        )
    )
    if table is None:
        raise TableQrError("This table QR code is no longer valid")
    seating = await db.scalar(
        select(TableSeating)
        .join(TableSeatingTable, TableSeatingTable.seating_id == TableSeating.id)
        .where(
            TableSeating.business_id == business_id,
            TableSeatingTable.table_id == table.id,
            TableSeating.status == "open",
        )
    )
    if seating is None:
        raise TableQrError("This table is not currently seated; please ask a staff member")
    return table, seating

