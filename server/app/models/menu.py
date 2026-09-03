import uuid
from datetime import datetime, time, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Menu(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "menus"

    # Tenant-aligned unique so menu_activation_windows can carry a composite FK
    # on (menu_id, business_id). Mirrors migration 051; menu_items has had the
    # equivalent since 042.
    __table_args__ = (
        UniqueConstraint("id", "business_id", name="uq_menus_id_business"),
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
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    categories: Mapped[list["MenuCategory"]] = relationship(
        back_populates="menu",
        cascade="all, delete-orphan",
        order_by="MenuCategory.display_order",
    )
    activation_windows: Mapped[list["MenuActivationWindow"]] = relationship(
        back_populates="menu",
        cascade="all, delete-orphan",
        order_by="MenuActivationWindow.created_at",
    )


class MenuActivationWindow(Base, UUIDMixin, TimestampMixin):
    """A recurring window during which a menu is served to guests.

    A menu with no active windows is always on; a menu with one or more is
    served only inside them. ``days_of_week`` uses the canonical
    0=Monday..6=Sunday convention (see ``app.constants.days``), and
    ``start_time``/``end_time`` are wall-clock local times interpreted against
    ``businesses.timezone`` — never UTC.

    Every constraint below is mirrored from migration 051 on purpose:
    tests/conftest.py builds its schema from this metadata rather than from the
    migration chain, so a constraint declared only in SQL is invisible to the
    entire suite.
    """

    __tablename__ = "menu_activation_windows"

    __table_args__ = (
        ForeignKeyConstraint(
            ["menu_id", "business_id"],
            ["menus.id", "menus.business_id"],
            ondelete="CASCADE",
            name="fk_menu_activation_window_menu_tenant",
        ),
        CheckConstraint(
            "days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6] "
            "AND array_length(days_of_week, 1) BETWEEN 1 AND 7",
            name="ck_menu_activation_window_days",
        ),
        # start_time > end_time is a valid overnight window; only equality is
        # meaningless, because it names a zero-length window.
        CheckConstraint(
            "start_time <> end_time",
            name="ck_menu_activation_window_times",
        ),
    )

    menu_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    days_of_week: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    menu: Mapped["Menu"] = relationship(back_populates="activation_windows")


class MenuCategory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "menu_categories"

    menu_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menus.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    menu: Mapped["Menu"] = relationship(back_populates="categories")
    items: Mapped[list["MenuItem"]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="MenuItem.display_order",
    )


class MenuItem(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "menu_items"
    __table_args__ = (
        CheckConstraint(
            "(routes_to_all_stations AND preparation_station_id IS NULL) OR "
            "(NOT routes_to_all_stations AND preparation_station_id IS NOT NULL)",
            name="ck_menu_item_station_routing",
        ),
    )

    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_categories.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    tax_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tax_profiles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0, nullable=False)
    # Age-verification flag. True = item is alcoholic; gates the checkout
    # attestation on customer channels and drives the staff alcohol badge.
    is_alcoholic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    routing_tag: Mapped[str] = mapped_column(String(20), default="kitchen", nullable=False)
    # routing_tag: kitchen | bar | any
    preparation_station_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("preparation_stations.id", ondelete="RESTRICT"),
        nullable=True,
    )
    routes_to_all_stations: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    image: Mapped[str | None] = mapped_column(Text, nullable=True)

    category: Mapped["MenuCategory"] = relationship(back_populates="items")
    modifier_groups: Mapped[list["ModifierGroup"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
    )
    tax_profile: Mapped["TaxProfile"] = relationship(lazy="selectin")

    @property
    def current_tax_version(self):
        eligible = [
            version
            for version in (self.tax_profile.versions if self.tax_profile else [])
            if version.effective_from <= datetime.now(timezone.utc)
        ]
        return max(eligible, key=lambda version: version.effective_from) if eligible else None

    @property
    def tax_profile_code(self) -> str | None:
        return self.tax_profile.code if self.tax_profile else None

    @property
    def tax_profile_name(self) -> str | None:
        version = self.current_tax_version
        return version.name if version else None

    @property
    def tax_rate(self) -> Decimal | None:
        version = self.current_tax_version
        return version.rate if version else None

    @property
    def price_includes_tax(self) -> bool | None:
        version = self.current_tax_version
        return version.price_includes_tax if version else None


class ModifierGroup(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "modifier_groups"

    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    min_select: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_select: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    item: Mapped["MenuItem"] = relationship(back_populates="modifier_groups")
    modifiers: Mapped[list["Modifier"]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
    )


class Modifier(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "modifiers"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("modifier_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price_delta: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    group: Mapped["ModifierGroup"] = relationship(back_populates="modifiers")


class ItemLibrary(Base, UUIDMixin, TimestampMixin):
    """Business-scoped reusable item templates. Copied into categories on demand."""

    __tablename__ = "item_library"
    __table_args__ = (
        CheckConstraint(
            "(routes_to_all_stations AND preparation_station_id IS NULL) OR "
            "(NOT routes_to_all_stations AND preparation_station_id IS NOT NULL)",
            name="ck_library_item_station_routing",
        ),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
    )
    tax_profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tax_profiles.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4), default=0, nullable=False)
    routing_tag: Mapped[str] = mapped_column(String(20), default="kitchen", nullable=False)
    preparation_station_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("preparation_stations.id", ondelete="RESTRICT"),
        nullable=True,
    )
    routes_to_all_stations: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)


class MenuItemAvailabilityEvent(Base, UUIDMixin):
    __tablename__ = "menu_item_availability_events"

    business_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("businesses.id", ondelete="RESTRICT"), nullable=False
    )
    menu_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="RESTRICT"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, nullable=False)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    reason: Mapped[str | None] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


from app.models.tax import TaxProfile  # noqa: E402
