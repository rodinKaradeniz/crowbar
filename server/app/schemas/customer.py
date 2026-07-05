from datetime import datetime
from uuid import UUID


from app.schemas.base import AppBaseModel


class CustomerResponse(AppBaseModel):
    id: UUID
    business_id: UUID
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    created_at: datetime
    updated_at: datetime

