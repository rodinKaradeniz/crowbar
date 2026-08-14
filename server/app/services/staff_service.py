from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.staff_invitation import StaffInvitation
from app.models.staff import Staff
from app.models.user import User
from app.schemas.staff import StaffCreate, StaffUpdate


class StaffAuthorityError(ValueError):
    pass


async def get_staff_by_business(
    db: AsyncSession, business_id: UUID
) -> list[Staff]:
    result = await db.execute(
        select(Staff)
        .where(Staff.business_id == business_id)
        .options(selectinload(Staff.user))
        .order_by(Staff.created_at)
    )
    return list(result.scalars().all())


async def get_staff_by_id(db: AsyncSession, staff_id: UUID) -> Staff | None:
    result = await db.execute(select(Staff).where(Staff.id == staff_id))
    return result.scalar_one_or_none()


async def get_staff_by_id_for_business(
    db: AsyncSession,
    staff_id: UUID,
    business_id: UUID,
    *,
    for_update: bool = False,
) -> Staff | None:
    statement = (
        select(Staff)
        .where(Staff.id == staff_id, Staff.business_id == business_id)
        .options(selectinload(Staff.user))
    )
    if for_update:
        statement = statement.with_for_update()
    return await db.scalar(statement)


async def get_assignment(
    db: AsyncSession, user_id: UUID, business_id: UUID
) -> Staff | None:
    return await db.scalar(
        select(Staff).where(
            Staff.user_id == user_id,
            Staff.business_id == business_id,
        )
    )


def assert_can_manage_role(
    actor_role: str, target_role: str | None, new_role: str | None = None
) -> None:
    if actor_role == "owner":
        return
    if actor_role != "manager":
        raise StaffAuthorityError("Only an owner or manager can manage staff")
    if target_role not in (None, "staff") or new_role not in (None, "staff"):
        raise StaffAuthorityError("Managers can manage staff members only")


async def get_staff_by_user_id(db: AsyncSession, user_id: UUID) -> list[Staff]:
    result = await db.execute(
        select(Staff).where(Staff.user_id == user_id)
    )
    return list(result.scalars().all())


async def create_staff(
    db: AsyncSession, business_id: UUID, data: StaffCreate
) -> Staff:
    user = await db.scalar(
        select(User).where(User.id == data.user_id, User.is_active.is_(True))
    )
    if user is None:
        raise StaffAuthorityError("User is not available for staff assignment")
    existing = await get_assignment(db, data.user_id, business_id)
    if existing is not None:
        raise StaffAuthorityError("User is already assigned to this business")
    staff = Staff(
        user_id=data.user_id,
        business_id=business_id,
        role=data.role,
    )
    db.add(staff)
    await db.flush()
    return staff


async def update_staff(
    db: AsyncSession,
    staff: Staff,
    data: StaffUpdate,
) -> Staff | None:
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(staff, key, value)

    await db.flush()
    return staff


async def delete_staff(db: AsyncSession, staff: Staff) -> bool:
    user = staff.user
    await db.delete(staff)
    user.is_active = False
    user.session_version += 1
    await db.flush()
    return True


async def owner_count_for_update(
    db: AsyncSession, business_id: UUID
) -> int:
    owners = list(
        (
            await db.scalars(
                select(Staff)
                .where(Staff.business_id == business_id, Staff.role == "owner")
                .with_for_update()
            )
        ).all()
    )
    return len(owners)


async def list_invitations(
    db: AsyncSession, business_id: UUID
) -> list[StaffInvitation]:
    return list(
        (
            await db.scalars(
                select(StaffInvitation)
                .where(StaffInvitation.business_id == business_id)
                .order_by(StaffInvitation.created_at.desc())
            )
        ).all()
    )


async def get_invitation_for_business(
    db: AsyncSession,
    invitation_id: UUID,
    business_id: UUID,
    *,
    for_update: bool = False,
) -> StaffInvitation | None:
    statement = select(StaffInvitation).where(
        StaffInvitation.id == invitation_id,
        StaffInvitation.business_id == business_id,
    )
    if for_update:
        statement = statement.with_for_update()
    return await db.scalar(statement)
