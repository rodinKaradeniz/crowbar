import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class InventoryItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "inventory_items"
    __table_args__ = (
        CheckConstraint("par_quantity IS NULL OR par_quantity >= 0", name="ck_inventory_par_nonnegative"),
        CheckConstraint("cost_per_unit IS NULL OR cost_per_unit >= 0", name="ck_inventory_cost_nonnegative"),
        CheckConstraint("container_volume_ml IS NULL OR container_volume_ml > 0", name="ck_inventory_container_positive"),
        CheckConstraint("default_pour_ml IS NULL OR default_pour_ml > 0", name="ck_inventory_pour_positive"),
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
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Free-text display unit (e.g. "L", "kg", "oz"). Cosmetic label only.
    unit: Mapped[str] = mapped_column(String(50), default="each", nullable=False)
    # Unit-of-measure semantics: 'each' = countable (unchanged legacy behavior);
    # 'bottle'/'keg' = liquid tracked in ml (current_quantity/par_quantity are ml).
    # bottle and keg share identical math — they differ only in UI size presets.
    unit_type: Mapped[str] = mapped_column(String(16), default="each", nullable=False)
    # ml capacity of one storage container (one bottle / one keg). Used to convert
    # a container-count receipt into a ml delta. NULL for 'each' items.
    container_volume_ml: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 3), nullable=True
    )
    # Optional reference pour size (ml) for a bottle/keg, used ONLY for the rough
    # "pours remaining" staff estimate (floor(current_quantity / default_pour_ml)).
    # Independent of any recipe. NULL = no estimate shown (no fabricated fallback).
    default_pour_ml: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 3), nullable=True
    )
    current_quantity: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), default=0, nullable=False
    )
    par_quantity: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
    cost_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    movements: Mapped[list["StockMovement"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="StockMovement.created_at.desc()",
    )


class StockMovement(Base, UUIDMixin):
    __tablename__ = "stock_movements"

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
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The order this movement belongs to, for 'sale'/'sale_reversal' recipe
    # deductions. NULL for manual receive/adjust/waste. Lets an un-serve reverse
    # exactly the movements a given order deducted (never a recipe recompute).
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    movement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # movement_type: receive | adjust | waste | sale | sale_reversal
    # 'sale'          = automatic deduction from recipe on order fulfillment.
    # 'sale_reversal' = credit-back when an order is moved backward out of 'served'.
    # Both are system-generated (see recipe_service); StockMovementCreate rejects them.
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    # Structured cause for a `waste` movement (spillage | wrong_measure | breakage
    # | spoilage | other), for later waste-per-item aggregation. NULL for older
    # rows and for non-waste movements. `notes` holds the optional free-text detail.
    reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    alert_triggered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    item: Mapped["InventoryItem"] = relationship(back_populates="movements")


class InventoryDiscrepancy(Base, UUIDMixin):
    __tablename__ = "inventory_discrepancies"

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL")
    )
    item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("inventory_items.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    details: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="open", server_default="open", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
