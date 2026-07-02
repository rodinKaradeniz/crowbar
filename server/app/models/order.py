import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.tab import Tab


class Order(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "orders"

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
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="SET NULL"),
        nullable=True,
    )
    table_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tables.id", ondelete="SET NULL"),
        nullable=True,
    )
    tab_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tabs.id", ondelete="SET NULL"),
        nullable=True,
    )
    session_token: Mapped[str] = mapped_column(String(64), nullable=False)
    table_identifier: Mapped[str | None] = mapped_column(String(100), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(16), nullable=True)
    fulfillment_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="received", nullable=False)
    # status: received | preparing | ready | served | cancelled
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    # Self-attestation recorded at placement. Whether the order actually contains
    # alcohol is derived from the line items on demand, not stored here.
    age_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    placed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    line_items: Mapped[list["OrderLineItem"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
    )
    status_timeline: Mapped[list["OrderStatusTimeline"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderStatusTimeline.changed_at",
    )
    tab: Mapped["Tab | None"] = relationship(back_populates="orders")


class OrderLineItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "order_line_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    selected_modifiers: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    routing_tag: Mapped[str] = mapped_column(String(20), default="kitchen", nullable=False)
    # Snapshot of the menu item's is_alcoholic at placement (like routing_tag),
    # so the staff badge is stable even if the menu item is later edited/deleted.
    is_alcoholic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped["Order"] = relationship(back_populates="line_items")


class OrderStatusTimeline(Base, UUIDMixin):
    __tablename__ = "order_status_timeline"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    order: Mapped["Order"] = relationship(back_populates="status_timeline")
