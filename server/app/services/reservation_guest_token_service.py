"""Signed, revision-bound public credentials for one reservation."""

import base64
import hashlib
import hmac
import time
from uuid import UUID

from app.config import settings


class ReservationGuestTokenError(ValueError):
    pass


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def issue_guest_token(*, business_id: UUID, reservation_id: UUID, revision: int) -> str:
    expires_at = int(time.time()) + 30 * 24 * 60 * 60
    payload = f"v2.crowbar-public.reservation.{business_id}.{reservation_id}.{revision}.{expires_at}".encode()
    encoded = _encode(payload)
    signature = hmac.new(
        settings.public_link_secret_key.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{encoded}.{_encode(signature)}"


def parse_guest_token(token: str) -> tuple[UUID, UUID, int]:
    try:
        encoded, provided_signature = token.split(".", 1)
        expected = hmac.new(
            settings.public_link_secret_key.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, _decode(provided_signature)):
            raise ReservationGuestTokenError("This reservation link is no longer valid")
        version, audience, purpose, business_id, reservation_id, revision, expires_at = _decode(encoded).decode().split(".")
        if (
            version != "v2"
            or audience != "crowbar-public"
            or purpose != "reservation"
            or int(expires_at) <= int(time.time())
        ):
            raise ReservationGuestTokenError("This reservation link is no longer valid")
        return UUID(business_id), UUID(reservation_id), int(revision)
    except (ValueError, UnicodeDecodeError, TypeError) as exc:
        if isinstance(exc, ReservationGuestTokenError):
            raise
        raise ReservationGuestTokenError("This reservation link is invalid") from exc
