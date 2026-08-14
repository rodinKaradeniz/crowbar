import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Reservation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint(
            "ends_at > time", name="ck_reservations_positive_interval"
        ),
        CheckConstraint(
            "(availability_override_reason IS NULL "
            "AND availability_overridden_at IS NULL) "
            "OR (availability_override_reason IS NOT NULL "
            "AND availability_overridden_at IS NOT NULL)",
            name="ck_reservations_override_audit",
        ),
        Index(
            "idx_reservations_active_overlap",
            "business_id",
            "service_type_id",
            "time",
            "ends_at",
            postgresql_where=text("status IN ('pending', 'confirmed')"),
        ),
        UniqueConstraint(
            "business_id",
            "idempotency_key",
            name="uq_reservations_business_idempotency_key",
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
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
    ends_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    guests: Mapped[int] = mapped_column(Integer, default=1)
    channel: Mapped[str | None] = mapped_column(String(16), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    request_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sms_reminder_sent: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, server_default="false"
    )
    availability_override_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    availability_override_reason: Mapped[str | None] = mapped_column(Text)
    availability_overridden_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    guest_token_revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_by: Mapped[str | None] = mapped_column(String(16))
    cancelled_late: Mapped[bool | None] = mapped_column(Boolean)
    no_show_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    no_show_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    no_show_note: Mapped[str | None] = mapped_column(Text)
    reconfirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    business: Mapped["Business"] = relationship(back_populates="reservations")
    customer: Mapped["Customer"] = relationship()
    service_type: Mapped["ServiceType"] = relationship(back_populates="reservations")
    availability_override_user: Mapped["User | None"] = relationship(
        foreign_keys=[availability_override_by]
    )
    no_show_user: Mapped["User | None"] = relationship(foreign_keys=[no_show_by])

    @property
    def availability_override_actor_name(self) -> str | None:
        if self.availability_override_by is None:
            return None
        return (
            self.availability_override_user.name
            if self.availability_override_user is not None
            else None
        )


from app.models.business import Business  # noqa: E402
from app.models.customer import Customer  # noqa: E402
from app.models.service_type import ServiceType  # noqa: E402
from app.models.user import User  # noqa: E402
