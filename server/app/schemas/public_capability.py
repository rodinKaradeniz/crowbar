from typing import Literal

from pydantic import Field

from app.schemas.base import AppBaseModel


class PublicCapabilityExchange(AppBaseModel):
    kind: Literal[
        "reservation", "waitlist_manage", "waitlist_offer", "password_reset", "staff_invite"
    ]
    token: str = Field(min_length=16, max_length=500)
