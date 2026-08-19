"""Opaque, revision-bound guest credentials for one waitlist offer."""

import base64
import hashlib
import hmac
from uuid import UUID

from app.config import settings


class WaitlistOfferTokenError(ValueError):
    pass


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _issue(*, purpose: str, business_id: UUID, entry_id: UUID, revision: int) -> str:
    encoded = _encode(f"v1.{purpose}.{business_id}.{entry_id}.{revision}".encode())
    signature = hmac.new(
        settings.secret_key.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{encoded}.{_encode(signature)}"


def _parse(token: str, *, purpose: str) -> tuple[UUID, UUID, int]:
    try:
        encoded, provided_signature = token.split(".", 1)
        expected = hmac.new(
            settings.secret_key.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(expected, _decode(provided_signature)):
            raise WaitlistOfferTokenError("This waitlist offer is no longer valid")
        version, token_purpose, business_id, entry_id, revision = _decode(encoded).decode().split(".")
        if version != "v1" or token_purpose != purpose:
            raise WaitlistOfferTokenError("This waitlist offer is no longer valid")
        return UUID(business_id), UUID(entry_id), int(revision)
    except (ValueError, UnicodeDecodeError, TypeError) as exc:
        if isinstance(exc, WaitlistOfferTokenError):
            raise
        raise WaitlistOfferTokenError("This waitlist offer is invalid") from exc


def issue_offer_token(*, business_id: UUID, entry_id: UUID, revision: int) -> str:
    return _issue(purpose="offer", business_id=business_id, entry_id=entry_id, revision=revision)


def parse_offer_token(token: str) -> tuple[UUID, UUID, int]:
    return _parse(token, purpose="offer")


def issue_management_token(*, business_id: UUID, entry_id: UUID, revision: int) -> str:
    return _issue(purpose="manage", business_id=business_id, entry_id=entry_id, revision=revision)


def parse_management_token(token: str) -> tuple[UUID, UUID, int]:
    return _parse(token, purpose="manage")
