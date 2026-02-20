import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ServiceType(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "service_types"

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    max_concurrent_bookings: Mapped[int | None] = mapped_column(Integer)
    requires_payment: Mapped[bool] = mapped_column(Boolean, default=False)
    amount: Mapped[float | None] = mapped_column(Numeric(10, 2))
    duration: Mapped[int | None] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6")
    display_order: Mapped[int | None] = mapped_column(Integer)
    image: Mapped[str | None] = mapped_column(String(500))
    form_fields: Mapped[list | None] = mapped_column(JSONB)

    business: Mapped["Business"] = relationship(back_populates="service_types")
    reservations: Mapped[list["Reservation"]] = relationship(
        back_populates="service_type", lazy="selectin"
    )


from app.models.business import Business  # noqa: E402
from app.models.reservation import Reservation  # noqa: E402
