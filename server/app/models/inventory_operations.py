import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import DateTime, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base, TimestampMixin, UUIDMixin

class InventoryTransfer(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "inventory_transfers"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    source_location_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    destination_location_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    reference: Mapped[str | None] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

class InventoryTransferLine(Base, UUIDMixin):
    __tablename__ = "inventory_transfer_lines"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    transfer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    destination_inventory_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18,3), nullable=False)
    dispatched_movement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    received_movement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    received_quantity: Mapped[Decimal | None] = mapped_column(Numeric(18,3))
    discrepancy_reason: Mapped[str | None] = mapped_column(Text)

class InventoryCountSession(Base, UUIDMixin):
    __tablename__ = "inventory_count_sessions"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="open", nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    opened_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    reconciled_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

class InventoryCountLine(Base, UUIDMixin):
    __tablename__ = "inventory_count_lines"
    business_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    book_quantity: Mapped[Decimal] = mapped_column(Numeric(18,3), nullable=False)
    counted_quantity: Mapped[Decimal] = mapped_column(Numeric(18,3), nullable=False)
    variance_quantity: Mapped[Decimal] = mapped_column(Numeric(18,3), nullable=False)
    shrinkage_reason: Mapped[str | None] = mapped_column(String(32))
    note: Mapped[str | None] = mapped_column(Text)
    movement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
