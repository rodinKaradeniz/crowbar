import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDMixin


class MenuItemIngredient(Base, UUIDMixin):
    """A recipe line: one inventory item consumed by one menu item.

    Phase 8 / Tier B wiring of the former dead stub (migration 010, Non-Obvious
    #10). ``quantity`` is expressed in the LINKED inventory item's native unit
    (ml for bottle/keg items, count for 'each' items) — the deduction math is
    identical regardless, so no per-row unit column is stored.
    """

    __tablename__ = "menu_item_ingredients"
    __table_args__ = (
        UniqueConstraint("menu_item_id", "inventory_item_id"),
    )

    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    inventory_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
