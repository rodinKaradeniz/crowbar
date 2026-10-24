"""The venue notification page, and completing a guest data request from it.

A guest data request is an obligation with a clock on it. Until this page,
nothing anywhere wrote `customer_data_requests.status`, so every request a guest
raised stayed `pending` for ever. These tests cover what completing one must
refuse: another venue's request, a role that cannot action privacy, and a
deletion that has not actually been carried out.
"""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants import notifications as nconst
from app.models.business import Business
from app.models.customer import Customer, CustomerDataRequest
from app.models.notification import Notification
from app.models.staff import Staff
from app.models.user import User
from app.services import notification_service
from app.services.auth_service import create_access_token

ROLES = ("owner", "manager", "host_server", "bar_kitchen")


async def _venue(db: AsyncSession, slug: str) -> tuple[Business, Customer, dict[str, dict]]:
    business = Business(
        name=f"Venue {slug}",
        slug=slug,
        email=f"venue-{slug}@example.com",
        phone="5550000000",
        enabled_modules=["reservations", "queue", "ordering"],
        currency_code="EUR",
        onboarding_complete=True,
    )
    db.add(business)
    await db.flush()
    customer = Customer(business_id=business.id, name="Guest", email=f"guest-{slug}@example.com")
    db.add(customer)
    staff: dict[str, dict] = {}
    for role in ROLES:
        user = User(
            email=f"{role}-{slug}@example.com",
            name=f"{role.title()} {slug}",
            password_hash="x",
            user_type="staff",
        )
        db.add(user)
        await db.flush()
        db.add(Staff(user_id=user.id, business_id=business.id, role=role))
        staff[role] = {
            "user": user,
            "headers": {
                "Authorization": f"Bearer {create_access_token(str(user.id), 'staff')}"
            },
        }
    await db.commit()
    return business, customer, staff


async def _guest_request(
    db: AsyncSession, business: Business, customer: Customer, request_type: str
) -> CustomerDataRequest:
    """What `public_privacy` writes: a pending row and a narrowed fan-out."""
    request = CustomerDataRequest(
        business_id=business.id,
        customer_id=customer.id,
        request_type=request_type,
        status="pending",
        completed_at=None,
        requested_by=None,
    )
    db.add(request)
    await db.flush()
    await notification_service.notify_business_staff(
        db,
        business_id=business.id,
        kind=nconst.CUSTOMER_DATA_REQUEST,
        title="Guest data request",
        body="A guest asked for a copy of their data.",
        payload={
            "customer_id": str(customer.id),
            "request_type": request_type,
            "data_request_id": str(request.id),
        },
        capability=nconst.KIND_CAPABILITY[nconst.CUSTOMER_DATA_REQUEST],
    )
    await db.commit()
    return request


@pytest.mark.asyncio
async def test_the_venue_feed_shows_each_event_once_to_the_roles_it_was_sent_to(
    client: AsyncClient, db_session: AsyncSession
):
    business, customer, staff = await _venue(db_session, "venue-feed")
    request = await _guest_request(db_session, business, customer, "export")
    await notification_service.notify_business_staff(
        db_session,
        business_id=business.id,
        kind="inventory_low_stock",
        title="Low stock",
        body="Gin is below par.",
    )
    await db_session.commit()

    copies = await db_session.scalars(
        select(Notification).where(Notification.business_id == business.id)
    )
    assert len(list(copies.all())) == 2 + len(ROLES), "the fan-out wrote one row per recipient"

    owner = await client.get("/api/notifications/venue", headers=staff["owner"]["headers"])
    assert owner.status_code == 200, owner.text
    assert [n["kind"] for n in owner.json()] == ["inventory_low_stock", "customer_data_request"]
    privacy = owner.json()[1]
    assert privacy["data_request"]["id"] == str(request.id)
    assert privacy["data_request"]["status"] == "pending"
    assert privacy["data_request"]["customer_id"] == str(customer.id)
    assert "read_at" not in privacy

    for role in ("host_server", "bar_kitchen"):
        response = await client.get("/api/notifications/venue", headers=staff[role]["headers"])
        assert response.status_code == 200, response.text
        assert [n["kind"] for n in response.json()] == ["inventory_low_stock"], role

    filtered = await client.get(
        "/api/notifications/venue",
        params={"kind": ["customer_data_request"]},
        headers=staff["manager"]["headers"],
    )
    assert [n["kind"] for n in filtered.json()] == ["customer_data_request"]


@pytest.mark.asyncio
async def test_completing_a_request_records_who_and_when(
    client: AsyncClient, db_session: AsyncSession
):
    business, customer, staff = await _venue(db_session, "complete-export")
    request = await _guest_request(db_session, business, customer, "export")
    before = datetime.now(timezone.utc)

    response = await client.post(
        f"/api/customers/data-requests/{request.id}/complete",
        headers=staff["manager"]["headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "completed"

    await db_session.refresh(request)
    assert request.status == "completed"
    assert request.completed_by == staff["manager"]["user"].id
    assert request.completed_at is not None and request.completed_at >= before

    feed = await client.get("/api/notifications/venue", headers=staff["owner"]["headers"])
    state = feed.json()[0]["data_request"]
    assert state["status"] == "completed"
    assert state["completed_by_name"] == staff["manager"]["user"].name

    again = await client.post(
        f"/api/customers/data-requests/{request.id}/complete",
        headers=staff["owner"]["headers"],
    )
    assert again.status_code == 409
    assert again.json()["code"] == "DATA_REQUEST_COMPLETED"


@pytest.mark.asyncio
async def test_a_manager_cannot_complete_another_venues_request(
    client: AsyncClient, db_session: AsyncSession
):
    _a, _customer_a, staff_a = await _venue(db_session, "tenant-a")
    business_b, customer_b, _staff_b = await _venue(db_session, "tenant-b")
    request_b = await _guest_request(db_session, business_b, customer_b, "export")

    response = await client.post(
        f"/api/customers/data-requests/{request_b.id}/complete",
        headers=staff_a["manager"]["headers"],
    )
    assert response.status_code == 404

    await db_session.refresh(request_b)
    assert request_b.status == "pending"
    assert request_b.completed_by is None
    assert request_b.completed_at is None


@pytest.mark.asyncio
async def test_a_role_without_privacy_cannot_complete_a_request(
    client: AsyncClient, db_session: AsyncSession
):
    business, customer, staff = await _venue(db_session, "no-privacy")
    request = await _guest_request(db_session, business, customer, "export")
    # A refused call rolls the shared session back, which expires loaded rows.
    request_id = request.id

    for role in ("host_server", "bar_kitchen"):
        response = await client.post(
            f"/api/customers/data-requests/{request_id}/complete",
            headers=staff[role]["headers"],
        )
        assert response.status_code == 403, role

    await db_session.refresh(request)
    assert request.status == "pending"


@pytest.mark.asyncio
async def test_a_deletion_request_completes_only_once_the_guest_is_anonymised(
    client: AsyncClient, db_session: AsyncSession
):
    business, customer, staff = await _venue(db_session, "complete-deletion")
    request = await _guest_request(db_session, business, customer, "deletion")
    headers = staff["owner"]["headers"]
    # A refused call rolls the shared session back, which expires loaded rows.
    request_id, customer_id, owner_id = request.id, customer.id, staff["owner"]["user"].id

    early = await client.post(f"/api/customers/data-requests/{request_id}/complete", headers=headers)
    assert early.status_code == 409
    assert early.json()["code"] == "GUEST_NOT_ANONYMISED"
    await db_session.refresh(request)
    assert request.status == "pending"

    # The erasure itself is the existing action on the guest's profile.
    anonymised = await client.post(
        f"/api/customers/{customer_id}/data-requests",
        json={"request_type": "deletion"},
        headers=headers,
    )
    assert anonymised.status_code == 200, anonymised.text

    done = await client.post(f"/api/customers/data-requests/{request_id}/complete", headers=headers)
    assert done.status_code == 200, done.text
    await db_session.refresh(request)
    assert request.status == "completed"
    assert request.completed_by == owner_id
