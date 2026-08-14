from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer


async def upsert_customer(
    db: AsyncSession,
    business_id: UUID,
    phone: str | None,
    email: str | None = None,
    name: str | None = None,
) -> Customer | None:
    """Find or create a customer by (business_id, phone).

    Phone is the canonical unique key. Phoneless calls return None — anonymous
    flows do not get a customer record. When a row exists, name/email are
    updated only if a non-empty value is supplied (existing values are preserved).
    """
    if not phone:
        return None

    identity_key = f"customer:{business_id}:{phone}"
    await db.execute(
        select(
            func.pg_advisory_xact_lock(func.hashtextextended(identity_key, 0))
        )
    )

    stmt = select(Customer).where(
        Customer.business_id == business_id,
        Customer.phone == phone,
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing is not None:
        if name:
            existing.name = name
        if email:
            existing.email = email
        await db.flush()
        return existing

    customer = Customer(
        business_id=business_id,
        phone=phone,
        email=email,
        name=name,
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)
    return customer
