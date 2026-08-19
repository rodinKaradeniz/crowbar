import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class DeliveryAttempt(Base, UUIDMixin, TimestampMixin):
    """Per-channel delivery state for retryable reservation, queue, and waitlist messages."""

    __tablename__ = "delivery_attempts"
    __table_args__ = (
        Index(
            "uq_delivery_attempt_reservation_message_channel",
            "reservation_id", "message_kind", "channel", unique=True,
            postgresql_where=text("reservation_id IS NOT NULL"),
        ),
        Index(
            "uq_delivery_attempt_queue_message_channel",
            "queue_entry_id", "message_kind", "channel", unique=True,
            postgresql_where=text("queue_entry_id IS NOT NULL"),
        ),
        Index(
            "uq_delivery_attempt_waitlist_message_channel",
            "waitlist_entry_id", "message_kind", "channel", unique=True,
            postgresql_where=text("waitlist_entry_id IS NOT NULL"),
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
        CheckConstraint(
            "num_nonnulls(reservation_id, queue_entry_id, waitlist_entry_id) = 1",
            name="ck_delivery_attempt_exactly_one_target",
        ),
    )

    reservation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("reservations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    queue_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queue_entries.id", ondelete="CASCADE"), nullable=True, index=True
    )
    waitlist_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reservation_waitlist_entries.id", ondelete="CASCADE"), nullable=True, index=True
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


# Compatibility import for the established reservation reminder code.
ReservationDeliveryAttempt = DeliveryAttempt
