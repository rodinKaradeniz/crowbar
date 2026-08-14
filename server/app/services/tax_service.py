from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.regional import currency_quantum
from app.models.business import Business
from app.models.menu import ItemLibrary, MenuItem
from app.models.tax import TaxProfile, TaxProfileVersion
from app.schemas.tax import TaxProfileCreate, TaxProfileVersionCreate


class TaxProfileError(ValueError):
    pass


GERMANY_EDITABLE_DEFAULTS = (
    ("STANDARD", "Standard", Decimal("19"), "Suggested German standard rate; verify with the venue's adviser."),
    ("REDUCED", "Reduced", Decimal("7"), "Suggested German reduced rate; verify item eligibility."),
    ("EXEMPT", "Exempt / zero", Decimal("0"), "Operational zero-rate or exempt treatment; confirm the legal basis."),
    ("CUSTOM", "Custom", Decimal("0"), "Editable placeholder for venue-specific treatment."),
)


async def create_default_profiles(
    db: AsyncSession,
    business: Business,
    *,
    actor_id: UUID | None = None,
) -> list[TaxProfile]:
    defaults = GERMANY_EDITABLE_DEFAULTS if business.country_code == "DE" else (
        ("STANDARD", "Standard", Decimal("0"), "Set the venue's operational rate before assigning items."),
        ("EXEMPT", "Exempt / zero", Decimal("0"), "Confirm the venue's treatment before assigning items."),
        ("CUSTOM", "Custom", Decimal("0"), "Editable venue-specific treatment."),
    )
    profiles = []
    now = datetime.now(timezone.utc)
    for code, name, rate, note in defaults:
        profile = TaxProfile(
            business_id=business.id,
            code=code,
            created_by=actor_id,
        )
        db.add(profile)
        await db.flush()
        db.add(
            TaxProfileVersion(
                tax_profile_id=profile.id,
                business_id=business.id,
                name=name,
                rate=rate,
                price_includes_tax=True,
                effective_from=now,
                note=note,
                created_by=actor_id,
            )
        )
        profiles.append(profile)
    await db.flush()
    return profiles


def current_version(profile: TaxProfile, at: datetime | None = None) -> TaxProfileVersion | None:
    instant = at or datetime.now(timezone.utc)
    eligible = [version for version in profile.versions if version.effective_from <= instant]
    return max(eligible, key=lambda version: version.effective_from) if eligible else None


def profile_to_dict(profile: TaxProfile) -> dict:
    return {
        "id": profile.id,
        "business_id": profile.business_id,
        "code": profile.code,
        "is_active": profile.is_active,
        "created_by": profile.created_by,
        "archived_by": profile.archived_by,
        "archived_at": profile.archived_at,
        "created_at": profile.created_at,
        "updated_at": profile.updated_at,
        "current_version": current_version(profile),
        "versions": sorted(profile.versions, key=lambda version: version.effective_from, reverse=True),
    }


async def list_profiles(db: AsyncSession, business_id: UUID) -> list[TaxProfile]:
    rows = await db.scalars(
        select(TaxProfile)
        .where(TaxProfile.business_id == business_id)
        .options(selectinload(TaxProfile.versions))
        .order_by(TaxProfile.is_active.desc(), TaxProfile.code)
    )
    return list(rows.unique().all())


async def get_profile(db: AsyncSession, business_id: UUID, profile_id: UUID) -> TaxProfile | None:
    return await db.scalar(
        select(TaxProfile)
        .where(TaxProfile.id == profile_id, TaxProfile.business_id == business_id)
        .options(selectinload(TaxProfile.versions))
    )


async def create_profile(
    db: AsyncSession, business_id: UUID, actor_id: UUID, data: TaxProfileCreate
) -> TaxProfile:
    existing = await db.scalar(
        select(TaxProfile.id).where(
            TaxProfile.business_id == business_id, TaxProfile.code == data.code
        )
    )
    if existing:
        raise TaxProfileError("A tax profile with this code already exists")
    profile = TaxProfile(business_id=business_id, code=data.code, created_by=actor_id)
    db.add(profile)
    await db.flush()
    await add_version(db, business_id, profile.id, actor_id, data)
    await db.refresh(profile, ["versions"])
    return profile


async def add_version(
    db: AsyncSession,
    business_id: UUID,
    profile_id: UUID,
    actor_id: UUID | None,
    data: TaxProfileVersionCreate,
) -> TaxProfile:
    profile = await get_profile(db, business_id, profile_id)
    if profile is None:
        raise TaxProfileError("Tax profile not found")
    if not profile.is_active:
        raise TaxProfileError("Archived tax profiles cannot receive new versions")
    effective_from = data.effective_from or datetime.now(timezone.utc)
    if effective_from.tzinfo is None:
        raise TaxProfileError("Effective time must include a timezone")
    duplicate = any(version.effective_from == effective_from for version in profile.versions)
    if duplicate:
        raise TaxProfileError("A version already starts at that time")
    db.add(
        TaxProfileVersion(
            tax_profile_id=profile.id,
            business_id=business_id,
            name=data.name,
            rate=data.rate,
            price_includes_tax=data.price_includes_tax,
            effective_from=effective_from,
            note=data.note,
            created_by=actor_id,
        )
    )
    await db.flush()
    await db.refresh(profile, ["versions"])
    return profile


async def archive_profile(
    db: AsyncSession, business_id: UUID, profile_id: UUID, actor_id: UUID
) -> TaxProfile:
    profile = await get_profile(db, business_id, profile_id)
    if profile is None:
        raise TaxProfileError("Tax profile not found")
    assigned_menu = await db.scalar(
        select(func.count()).select_from(MenuItem).where(
            MenuItem.business_id == business_id, MenuItem.tax_profile_id == profile_id
        )
    )
    assigned_library = await db.scalar(
        select(func.count()).select_from(ItemLibrary).where(
            ItemLibrary.business_id == business_id, ItemLibrary.tax_profile_id == profile_id
        )
    )
    if (assigned_menu or 0) + (assigned_library or 0) > 0:
        raise TaxProfileError("Reassign menu and library items before archiving this profile")
    profile.is_active = False
    profile.archived_by = actor_id
    profile.archived_at = datetime.now(timezone.utc)
    await db.flush()
    return profile


async def resolve_profile_version(
    db: AsyncSession, business_id: UUID, profile_id: UUID, at: datetime
) -> tuple[TaxProfile, TaxProfileVersion]:
    profile = await get_profile(db, business_id, profile_id)
    if profile is None or not profile.is_active:
        raise TaxProfileError("The assigned tax profile is missing or inactive")
    version = current_version(profile, at)
    if version is None:
        raise TaxProfileError("The assigned tax profile is not effective yet")
    return profile, version


def calculate_line_tax(
    entered_total: Decimal,
    rate: Decimal,
    price_includes_tax: bool,
    currency_code: str,
) -> tuple[Decimal, Decimal, Decimal]:
    quantum = currency_quantum(currency_code)
    entered = entered_total.quantize(quantum, rounding=ROUND_HALF_UP)
    if rate == 0:
        return entered, Decimal("0").quantize(quantum), entered
    ratio = rate / Decimal("100")
    if price_includes_tax:
        gross = entered
        net = (gross / (Decimal("1") + ratio)).quantize(quantum, rounding=ROUND_HALF_UP)
        tax = gross - net
    else:
        net = entered
        tax = (net * ratio).quantize(quantum, rounding=ROUND_HALF_UP)
        gross = net + tax
    return net, tax, gross
