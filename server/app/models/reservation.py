import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
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
        ForeignKey("customers.id", ondelete="CASCADE"),
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
    channel: Mapped[str | None] = mapped_column(String(16), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sms_reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="false")

    business: Mapped["Business"] = relationship(back_populates="reservations")
    customer: Mapped["Customer"] = relationship()
    service_type: Mapped["ServiceType"] = relationship(back_populates="reservations")


from app.models.business import Business  # noqa: E402
from app.models.customer import Customer  # noqa: E402
from app.models.service_type import ServiceType  # noqa: E402
