from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import ROLE_LABELS, manageable_roles
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
    """Guard who may invite, edit, or remove whom.

    Holding `staff.manage` opens the Staff page; it does not say which roles you
    may hand out. An owner manages anyone. A manager manages only the three
    operational roles, so a manager can neither promote someone to manager or
    owner nor edit a peer — which is the privilege-escalation path this exists to
    close. Authority comes from `app.core.permissions`, not from a second list.
    """
    allowed = manageable_roles(actor_role)
    if not allowed:
        raise StaffAuthorityError("Only an owner or manager can manage staff")

    for role in (target_role, new_role):
        if role is not None and role not in allowed:
            raise StaffAuthorityError(
                f"A {ROLE_LABELS.get(actor_role, actor_role).lower()} cannot manage "
                f"the {ROLE_LABELS.get(role, role).lower()} role"
            )


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


async def sole_owner_business_ids(db: AsyncSession, user_id: UUID) -> list[UUID]:
    """Businesses where this user holds the only `owner` role.

    Anonymizing the only owner of a business leaves a ghost owner nobody can
    sign in as, so both the deletion request and the erasure refuse while this
    returns anything. `owner_count_for_update` row-locks the owner rows, which
    is what stops a concurrent demotion from making a second owner disappear
    between the count and the decision.
    """
    business_ids = [
        assignment.business_id
        for assignment in (
            await db.scalars(
                select(Staff).where(Staff.user_id == user_id, Staff.role == "owner")
            )
        ).all()
    ]
    return [
        business_id
        for business_id in business_ids
        if await owner_count_for_update(db, business_id) <= 1
    ]


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
