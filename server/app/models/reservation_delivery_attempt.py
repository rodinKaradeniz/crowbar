import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class ReservationDeliveryAttempt(Base, UUIDMixin, TimestampMixin):
    """Per-channel delivery state for retryable reservation messages."""

    __tablename__ = "reservation_delivery_attempts"
    __table_args__ = (
        UniqueConstraint(
            "reservation_id",
            "message_kind",
            "channel",
            name="uq_reservation_delivery_attempt_message_channel",
        ),
        CheckConstraint(
            "channel IN ('email', 'sms')",
            name="ck_reservation_delivery_attempt_channel",
        ),
        CheckConstraint(
            "status IN ('pending', 'failed', 'delivered')",
            name="ck_reservation_delivery_attempt_status",
        ),
        CheckConstraint(
            "attempt_count >= 0",
            name="ck_reservation_delivery_attempt_count",
        ),
    )

    reservation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reservations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    message_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
