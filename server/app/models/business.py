from sqlalchemy import Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Business(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "businesses"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    image: Mapped[str | None] = mapped_column(String(500))
    website: Mapped[str | None] = mapped_column(String(500))
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(Text), default=list)
    max_guests: Mapped[int] = mapped_column(Integer, default=10)
    reservation_time: Mapped[int] = mapped_column(Integer, default=60)
    time_slot_interval: Mapped[int] = mapped_column(Integer, default=15)
    advance_booking_days: Mapped[int] = mapped_column(Integer, default=30)
    operating_hours: Mapped[dict] = mapped_column(JSONB, default=dict)

    staff: Mapped[list["Staff"]] = relationship(
        back_populates="business", lazy="selectin"
    )
    service_types: Mapped[list["ServiceType"]] = relationship(
        back_populates="business", lazy="selectin"
    )
    reservations: Mapped[list["Reservation"]] = relationship(
        back_populates="business", lazy="selectin"
    )


from app.models.reservation import Reservation  # noqa: E402
from app.models.service_type import ServiceType  # noqa: E402
from app.models.staff import Staff  # noqa: E402
