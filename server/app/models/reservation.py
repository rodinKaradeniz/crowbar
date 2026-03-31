import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Reservation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reservations"

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("service_types.id", ondelete="CASCADE"),
        nullable=False,
    )
    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    guests: Mapped[int] = mapped_column(Integer, default=1)
    payment_amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    payment_status: Mapped[str | None] = mapped_column(String(20))
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255))
    meeting_link: Mapped[str | None] = mapped_column(String(500))
    google_calendar_event_id: Mapped[str | None] = mapped_column(String(255))
    custom_fields: Mapped[dict | None] = mapped_column(JSONB)

    business: Mapped["Business"] = relationship(back_populates="reservations")
    customer: Mapped["User"] = relationship(back_populates="reservations")
    service_type: Mapped["ServiceType"] = relationship(back_populates="reservations")


from app.models.business import Business  # noqa: E402
from app.models.service_type import ServiceType  # noqa: E402
from app.models.user import User  # noqa: E402
