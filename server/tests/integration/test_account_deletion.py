"""Account deletion, which is anonymization rather than DELETE.

The point of every test here is that the person goes and the record stays. A
DELETE would empty forty-three audit trails and be refused outright by
tabs.opened_by; erasure scrubs the row and leaves all forty-eight references
pointing at a row that identifies nobody.
"""

from datetime import datetime, timedelta, timezone

import pytest
import sqlalchemy.exc
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.inventory_operations import InventoryCountSession
from app.models.location import Location
from app.models.staff import Staff
from app.models.user import User
from app.services.auth_service import (
    ANONYMIZED_USER_NAME,
    DELETION_GRACE_DAYS,
    anonymize_due_users,
    create_access_token,
    hash_password,
)

PASSWORD = "test-password-1234"


async def _business(db: AsyncSession, slug: str) -> Business:
    business = Business(
        name=f"Venue {slug}",
        slug=slug,
        email=f"venue-{slug}@example.com",
        phone="5550000000",
        currency_code="EUR",
        onboarding_complete=True,
    )
    db.add(business)
    await db.flush()
    db.add(Location(business_id=business.id, name="Main room", is_primary=True))
    await db.flush()
    return business


async def _staff(
    db: AsyncSession, business: Business, *, role: str, slug: str
) -> User:
    user = User(
        email=f"{slug}@example.com",
        name=f"{slug} person",
        phone="+4915112345678",
        password_hash=hash_password(PASSWORD),
        user_type="staff",
    )
    db.add(user)
    await db.flush()
    db.add(Staff(user_id=user.id, business_id=business.id, role=role))
    await db.flush()
    return user


def _auth(user: User) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {create_access_token(str(user.id), 'staff', user.session_version)}"
    }


class TestRequestingDeletion:
    @pytest.mark.asyncio
    async def test_sole_owner_is_refused(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        business = await _business(db_session, "sole-owner-venue")
        owner = await _staff(db_session, business, role="owner", slug="only-owner")
        await db_session.commit()

        response = await client.post("/api/auth/delete-account", headers=_auth(owner))

        assert response.status_code == 409
        assert response.json()["code"] == "LAST_OWNER"
        await db_session.refresh(owner)
        assert owner.deletion_requested_at is None

    @pytest.mark.asyncio
    async def test_second_owner_makes_the_request_allowed(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        business = await _business(db_session, "two-owner-venue")
        first = await _staff(db_session, business, role="owner", slug="first-owner")
        await _staff(db_session, business, role="owner", slug="second-owner")
        await db_session.commit()

        response = await client.post("/api/auth/delete-account", headers=_auth(first))

        assert response.status_code == 200
        await db_session.refresh(first)
        assert first.deletion_requested_at is not None

    @pytest.mark.asyncio
    async def test_the_account_keeps_working_immediately_afterwards(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """The grace period is one column, not a third half-dead account state."""
        business = await _business(db_session, "keeps-working-venue")
        await _staff(db_session, business, role="owner", slug="kw-owner")
        member = await _staff(
            db_session, business, role="host_server", slug="kw-server"
        )
        await db_session.commit()
        headers = _auth(member)

        assert (
            await client.post("/api/auth/delete-account", headers=headers)
        ).status_code == 200

        await db_session.refresh(member)
        assert member.is_active is True
        assert member.session_version == 1

        # The same token, not a fresh one: the request must not have ended the
        # session, because signing in again is what cancels the request.
        me = await client.get("/api/auth/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["deletion_requested_at"] is not None

    @pytest.mark.asyncio
    async def test_asking_twice_does_not_restart_the_window(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        business = await _business(db_session, "twice-venue")
        await _staff(db_session, business, role="owner", slug="twice-owner")
        member = await _staff(db_session, business, role="manager", slug="twice-mgr")
        await db_session.commit()
        headers = _auth(member)

        await client.post("/api/auth/delete-account", headers=headers)
        await db_session.refresh(member)
        first_asked = member.deletion_requested_at

        await client.post("/api/auth/delete-account", headers=headers)
        await db_session.refresh(member)

        assert member.deletion_requested_at == first_asked

    @pytest.mark.asyncio
    async def test_signing_in_cancels_a_pending_request(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        business = await _business(db_session, "cancel-venue")
        await _staff(db_session, business, role="owner", slug="cancel-owner")
        member = await _staff(
            db_session, business, role="manager", slug="cancel-manager"
        )
        await db_session.commit()

        await client.post("/api/auth/delete-account", headers=_auth(member))
        await db_session.refresh(member)
        assert member.deletion_requested_at is not None

        login = await client.post(
            "/api/auth/login",
            json={"email": "cancel-manager@example.com", "password": PASSWORD},
        )

        assert login.status_code == 200
        await db_session.refresh(member)
        assert member.deletion_requested_at is None


class TestErasure:
    @pytest.mark.asyncio
    async def test_the_job_waits_out_the_window(self, db_session: AsyncSession):
        business = await _business(db_session, "window-venue")
        await _staff(db_session, business, role="owner", slug="window-owner")
        member = await _staff(
            db_session, business, role="host_server", slug="window-server"
        )
        now = datetime.now(timezone.utc)
        member.deletion_requested_at = now - timedelta(days=DELETION_GRACE_DAYS - 1)
        await db_session.commit()

        assert await anonymize_due_users(db_session, now=now) == 0
        await db_session.refresh(member)
        assert member.anonymized_at is None
        assert member.email == "window-server@example.com"

        member.deletion_requested_at = now - timedelta(days=DELETION_GRACE_DAYS + 1)
        await db_session.flush()

        assert await anonymize_due_users(db_session, now=now) == 1
        await db_session.refresh(member)
        assert member.anonymized_at is not None

    @pytest.mark.asyncio
    async def test_erasure_scrubs_the_person_and_ends_access(
        self, db_session: AsyncSession
    ):
        business = await _business(db_session, "scrub-venue")
        await _staff(db_session, business, role="owner", slug="scrub-owner")
        member = await _staff(
            db_session, business, role="bar_kitchen", slug="scrub-cook"
        )
        original_hash = member.password_hash
        now = datetime.now(timezone.utc)
        member.deletion_requested_at = now - timedelta(days=DELETION_GRACE_DAYS + 1)
        await db_session.commit()

        assert await anonymize_due_users(db_session, now=now) == 1

        await db_session.refresh(member)
        assert member.name == ANONYMIZED_USER_NAME
        assert member.email == f"deleted-{member.id}@deleted.invalid"
        assert member.phone is None
        assert member.avatar is None
        assert member.password_hash != original_hash
        assert member.is_active is False
        assert member.session_version == 2
        # When they asked is kept; it is the record of the request.
        assert member.deletion_requested_at is not None
        # Staff rows go, so the access goes with them.
        assert (
            await db_session.scalars(
                select(Staff).where(Staff.user_id == member.id)
            )
        ).all() == []

    @pytest.mark.asyncio
    async def test_an_erased_user_cannot_sign_in_and_does_not_error(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """The replacement password_hash has to be a real bcrypt hash.

        bcrypt.checkpw raises on a malformed hash, so a placeholder string would
        turn every later sign-in attempt into a 500 rather than a 401.
        """
        business = await _business(db_session, "signin-venue")
        await _staff(db_session, business, role="owner", slug="signin-owner")
        member = await _staff(
            db_session, business, role="manager", slug="signin-manager"
        )
        now = datetime.now(timezone.utc)
        member.deletion_requested_at = now - timedelta(days=DELETION_GRACE_DAYS + 1)
        await db_session.commit()
        await anonymize_due_users(db_session, now=now)
        await db_session.commit()

        response = await client.post(
            "/api/auth/login",
            json={"email": "signin-manager@example.com", "password": PASSWORD},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_erasure_is_refused_for_someone_who_became_the_last_owner(
        self, db_session: AsyncSession
    ):
        business = await _business(db_session, "stranded-venue")
        first = await _staff(db_session, business, role="owner", slug="stranded-a")
        second = await _staff(db_session, business, role="owner", slug="stranded-b")
        now = datetime.now(timezone.utc)
        first.deletion_requested_at = now - timedelta(days=DELETION_GRACE_DAYS + 1)
        await db_session.commit()

        # The other owner leaves after the request was raised. Delete the staff
        # row, not the user: the relationship has no delete-orphan cascade, so
        # deleting the user would null staff.user_id instead.
        other = await db_session.scalar(
            select(Staff).where(Staff.user_id == second.id)
        )
        await db_session.delete(other)
        await db_session.flush()

        assert await anonymize_due_users(db_session, now=now) == 0
        await db_session.refresh(first)
        assert first.anonymized_at is None
        assert first.deletion_requested_at is not None
        assert first.email == "stranded-a@example.com"

    @pytest.mark.asyncio
    async def test_an_audit_trail_still_resolves_to_a_former_staff_member(
        self, db_session: AsyncSession
    ):
        business = await _business(db_session, "audit-venue")
        await _staff(db_session, business, role="owner", slug="audit-owner")
        member = await _staff(
            db_session, business, role="inventory_operator", slug="audit-counter"
        )
        session_row = InventoryCountSession(
            business_id=business.id, kind="cycle", opened_by=member.id
        )
        db_session.add(session_row)
        now = datetime.now(timezone.utc)
        member.deletion_requested_at = now - timedelta(days=DELETION_GRACE_DAYS + 1)
        await db_session.commit()

        await anonymize_due_users(db_session, now=now)
        await db_session.commit()

        await db_session.refresh(session_row)
        assert session_row.opened_by == member.id
        actor = await db_session.get(User, session_row.opened_by)
        assert actor is not None
        assert actor.name == ANONYMIZED_USER_NAME


class TestSchema:
    @pytest.mark.asyncio
    async def test_an_erased_row_must_carry_the_request_that_caused_it(
        self, db_session: AsyncSession
    ):
        """Mirrors ck_users_anonymized_requires_request from migration 052.

        The test schema is built from Base.metadata, so this only passes because
        the constraint is declared on the model as well as in the SQL.
        """
        user = User(
            email="check@example.com",
            name="Check",
            password_hash=hash_password(PASSWORD),
            user_type="staff",
            anonymized_at=datetime.now(timezone.utc),
        )
        db_session.add(user)

        with pytest.raises(sqlalchemy.exc.IntegrityError):
            await db_session.flush()
