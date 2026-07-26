import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class ServiceType(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "service_types"
    __table_args__ = (
        UniqueConstraint(
            "id", "business_id", name="uq_service_types_id_business_id"
        ),
        CheckConstraint(
            "max_concurrent_bookings > 0",
            name="ck_service_types_max_concurrent_bookings_positive",
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    max_concurrent_bookings: Mapped[int] = mapped_column(
        Integer, default=1, nullable=False
    )
    is_pending_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    duration: Mapped[int | None] = mapped_column(Integer)
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6")
    display_order: Mapped[int | None] = mapped_column(Integer)
    image: Mapped[str | None] = mapped_column(String(500))

    business: Mapped["Business"] = relationship(back_populates="service_types")
    reservations: Mapped[list["Reservation"]] = relationship(
        back_populates="service_type", lazy="selectin"
    )
    booking_schedule: Mapped["BookingSchedule | None"] = relationship(
        back_populates="service_type",
        foreign_keys="BookingSchedule.service_type_id",
        uselist=False,
        passive_deletes="all",
    )


from app.models.business import Business  # noqa: E402
from app.models.booking_schedule import BookingSchedule  # noqa: E402
from app.models.reservation import Reservation  # noqa: E402
