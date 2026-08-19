import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDMixin


class ReservationWaitlistEntry(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "reservation_waitlist_entries"

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    service_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_types.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False
    )
    requested_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    flexible_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    guests: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="waiting", nullable=False)
    offer_token_revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    management_token_revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    request_fingerprint: Mapped[str | None] = mapped_column(String(64))
    offered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    offered_reservation_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    offer_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_reservation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("reservations.id", ondelete="SET NULL")
    )
    terminal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terminal_actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    terminal_reason_code: Mapped[str | None] = mapped_column(String(32))
    terminal_reason_note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
