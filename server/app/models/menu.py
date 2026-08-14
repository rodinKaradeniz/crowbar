import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin


class Menu(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "menus"

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
    # Flat happy-hour override price. NULL = item never discounts. Applied only
    # while a happy-hour window is active (see happy_hour_service).
    happy_hour_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    # Age-verification flag. True = item is alcoholic; gates the checkout
    # attestation on customer channels and drives the staff alcohol badge.
    is_alcoholic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    routing_tag: Mapped[str] = mapped_column(String(20), default="kitchen", nullable=False)
    # routing_tag: kitchen | bar | any
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
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)


from app.models.tax import TaxProfile  # noqa: E402
