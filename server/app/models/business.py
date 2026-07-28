from datetime import time

from sqlalchemy import Boolean, Integer, String, Text, Time
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Business(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "businesses"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # IANA timezone name (e.g. 'Europe/Istanbul'). Interprets wall-clock times
    # such as operating hours and happy-hour windows. Defaults to 'UTC'.
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    service_day_cutoff: Mapped[time] = mapped_column(
        Time, default=lambda: time(5, 0), nullable=False
    )
    # Age asserted at alcohol checkout. Configurable per business (differs by
    # country: 18 across most of the EU/Turkey, 21 in the US). Never hardcoded.
    legal_drinking_age: Mapped[int] = mapped_column(Integer, default=18, nullable=False)
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
    enabled_modules: Mapped[list] = mapped_column(
        JSONB,
        default=lambda: ["reservations", "queue", "ordering", "inventory", "insights"],
        nullable=False,
    )
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notification_channels: Mapped[list] = mapped_column(
        JSONB, default=lambda: ["email"], nullable=False
    )
    is_accepting_orders: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    ordering_config: Mapped[dict] = mapped_column(
        JSONB,
        default=lambda: {"allowed_fulfillment_types": ["dine_in"]},
        nullable=False,
    )
    bot_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    staff: Mapped[list["Staff"]] = relationship(
        back_populates="business", lazy="selectin"
    )
    service_types: Mapped[list["ServiceType"]] = relationship(
        back_populates="business", lazy="selectin"
    )
    booking_schedules: Mapped[list["BookingSchedule"]] = relationship(
        back_populates="business", lazy="selectin", passive_deletes="all"
    )
    reservations: Mapped[list["Reservation"]] = relationship(
        back_populates="business", lazy="selectin"
    )
    locations: Mapped[list["Location"]] = relationship(
        back_populates="business", lazy="selectin"
    )
    queue_entries: Mapped[list["QueueEntry"]] = relationship(
        back_populates="business", lazy="selectin"
    )


from app.models.queue_entry import QueueEntry  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.booking_schedule import BookingSchedule  # noqa: E402
from app.models.reservation import Reservation  # noqa: E402
from app.models.service_type import ServiceType  # noqa: E402
from app.models.staff import Staff  # noqa: E402
