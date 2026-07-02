from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CustomerResponse(BaseModel):
    id: UUID
    business_id: UUID
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
