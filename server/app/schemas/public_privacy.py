from typing import Literal

from pydantic import Field

from app.schemas.base import AppBaseModel

#: What a guest can ask for. Mirrors the `ck_customer_data_requests_type`
#: constraint. `access` reuses the existing `export` machinery — the guest asks
#: to see what the venue holds, and the venue exports it.
GuestRequestType = Literal["export", "correction", "deletion", "withdraw_consent"]


class PublicPrivacyRequest(AppBaseModel):
    """A request raised by the guest themselves.

    Carries no identity: the guest is resolved from the reservation capability
    cookie. Accepting a customer id or an email here would make the surface
    enumerable and would let one guest act on another's record.
    """

    request_type: GuestRequestType
    note: str | None = Field(default=None, max_length=1000)


class PublicPrivacyStateResponse(AppBaseModel):
    """Consent only — never the guest's profile or visit history."""

    marketing_consent: dict[str, bool]
    privacy_contact: str | None = None
    privacy_policy_url: str | None = None


class PublicPrivacyRequestResponse(AppBaseModel):
    request_type: GuestRequestType
    #: `completed` only for withdrawal, which takes effect immediately.
    #: Everything else is `pending` until a staff member actions it — saying
    #: otherwise would be a false completion.
    status: Literal["pending", "completed"]
    withdrawn_channels: list[str] = []
    privacy_contact: str | None = None
    message: str
