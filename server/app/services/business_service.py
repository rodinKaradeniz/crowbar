from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.inventory import InventoryItem
from app.models.location import Location
from app.models.menu import ItemLibrary, MenuItem
from app.models.order import Order
from app.models.tax import BusinessRegionalAudit
from app.schemas.business import BusinessCreate, BusinessUpdate
from app.core.regional import (
    RegionalValidationError,
    normalize_phone,
    validate_country_code,
    validate_currency_code,
    validate_locale,
    validate_tax_label,
    validate_timezone,
)
from app.services.booking_schedule_service import create_default_booking_schedule
from app.services import tax_service


REGIONAL_FIELDS = ("country_code", "currency_code", "locale", "timezone", "tax_label")


class BusinessConfigurationError(ValueError):
    pass


async def get_businesses(db: AsyncSession) -> list[Business]:
    result = await db.execute(select(Business).order_by(Business.created_at))
    return list(result.scalars().all())


async def get_business_by_id(db: AsyncSession, business_id: UUID) -> Business | None:
    result = await db.execute(select(Business).where(Business.id == business_id))
    return result.scalar_one_or_none()


async def get_business_by_slug(db: AsyncSession, slug: str) -> Business | None:
    result = await db.execute(select(Business).where(Business.slug == slug))
    return result.scalar_one_or_none()


async def create_business(db: AsyncSession, data: BusinessCreate) -> Business:
    try:
        country_code = validate_country_code(data.country_code)
        currency_code = validate_currency_code(data.currency_code)
        locale = validate_locale(data.locale)
        timezone = validate_timezone(data.timezone)
        phone = normalize_phone(data.phone, country_code)
        tax_label = validate_tax_label(data.tax_label)
    except RegionalValidationError as exc:
        raise BusinessConfigurationError(str(exc)) from exc
    business = Business(
        name=data.name,
        slug=data.slug,
        email=data.email,
        phone=phone or data.phone,
        timezone=timezone,
        country_code=country_code,
        currency_code=currency_code,
        locale=locale,
        tax_label=tax_label,
        address=data.address,
        description=data.description,
        image=data.image,
        website=data.website,
        tags=data.tags or [],
        max_guests=data.max_guests,
        reservation_time=data.reservation_time,
        time_slot_interval=data.time_slot_interval,
        advance_booking_days=data.advance_booking_days,
        operating_hours={k: v.model_dump() for k, v in data.operating_hours.items()},
    )
    db.add(business)
    await db.flush()
    await create_default_booking_schedule(db, business)
    await tax_service.create_default_profiles(db, business)
    db.add(
        Location(
            business_id=business.id,
            name=business.name,
            address=business.address,
            phone=business.phone,
            is_primary=True,
        )
    )
    await db.flush()
    return business


async def update_business(
    db: AsyncSession, business_id: UUID, data: BusinessUpdate, *, actor_id: UUID | None = None
) -> Business | None:
    business = await get_business_by_id(db, business_id)
    if business is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    resulting_country = update_data.get("country_code", business.country_code)
    try:
        if "country_code" in update_data:
            update_data["country_code"] = validate_country_code(update_data["country_code"])
            resulting_country = update_data["country_code"]
        if "currency_code" in update_data:
            update_data["currency_code"] = validate_currency_code(update_data["currency_code"])
        if "locale" in update_data:
            update_data["locale"] = validate_locale(update_data["locale"])
        if "timezone" in update_data:
            update_data["timezone"] = validate_timezone(update_data["timezone"])
        if "phone" in update_data:
            update_data["phone"] = normalize_phone(update_data["phone"], resulting_country)
    except RegionalValidationError as exc:
        raise BusinessConfigurationError(str(exc)) from exc
    if "tax_label" in update_data:
        try:
            update_data["tax_label"] = validate_tax_label(update_data["tax_label"])
        except RegionalValidationError as exc:
            raise BusinessConfigurationError(str(exc)) from exc

    if (
        "currency_code" in update_data
        and update_data["currency_code"] != business.currency_code
        and await _has_monetary_activity(db, business_id)
    ):
        raise BusinessConfigurationError(
            "Currency cannot be changed after priced catalogue, inventory, or order data exists"
        )
    if "operating_hours" in update_data and update_data["operating_hours"] is not None:
        update_data["operating_hours"] = {
            k: v.model_dump() if hasattr(v, "model_dump") else v
            for k, v in update_data["operating_hours"].items()
        }

    previous_region = {field: getattr(business, field) for field in REGIONAL_FIELDS}
    for key, value in update_data.items():
        setattr(business, key, value)

    new_region = {field: getattr(business, field) for field in REGIONAL_FIELDS}
    if previous_region != new_region:
        db.add(
            BusinessRegionalAudit(
                business_id=business.id,
                changed_by=actor_id,
                previous_values=previous_region,
                new_values=new_region,
            )
        )

    await db.flush()
    return business


async def _has_monetary_activity(db: AsyncSession, business_id: UUID) -> bool:
    for model in (MenuItem, ItemLibrary, InventoryItem, Order):
        count = await db.scalar(
            select(func.count()).select_from(model).where(model.business_id == business_id)
        )
        if count:
            return True
    return False


async def list_regional_audits(
    db: AsyncSession, business_id: UUID
) -> list[BusinessRegionalAudit]:
    rows = await db.scalars(
        select(BusinessRegionalAudit)
        .where(BusinessRegionalAudit.business_id == business_id)
        .order_by(BusinessRegionalAudit.changed_at.desc())
    )
    return list(rows.all())


async def delete_business(db: AsyncSession, business_id: UUID) -> bool:
    business = await get_business_by_id(db, business_id)
    if business is None:
        return False
    await db.delete(business)
    await db.flush()
    return True
