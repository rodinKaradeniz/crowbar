from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.customer import Customer
from app.models.location import Location
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.models.staff import Staff
from app.models.user import User
from app.services.auth_service import create_access_token


async def _tenant(
    db: AsyncSession,
    *,
    slug: str,
    role: str = "owner",
    enabled_modules: list[str] | None = None,
):
    business = Business(
        name=slug.title(),
        slug=slug,
        email=f"{slug}@example.com",
        phone="+14155552000",
        timezone="UTC",
        enabled_modules=enabled_modules or ["reservations", "queue", "ordering"],
    )
    user = User(
        email=f"{role}-{slug}@example.com",
        name=f"{role.title()} User",
        password_hash="unused",
        user_type="staff",
    )
    db.add_all([business, user])
    await db.flush()
    location = Location(
        business_id=business.id,
        name="Main",
        is_primary=True,
    )
    db.add_all([location, Staff(user_id=user.id, business_id=business.id, role=role)])
    await db.commit()
    token = create_access_token(str(user.id), "staff")
    return business, user, location, {"Authorization": f"Bearer {token}"}


async def _area_and_table(client, headers, *, label="T1", capacity=2):
    area_response = await client.post(
        "/api/floor-plan/areas",
        headers=headers,
        json={"name": "Main Room"},
    )
    assert area_response.status_code == 201, area_response.text
    table_response = await client.post(
        "/api/floor-plan/tables",
        headers=headers,
        json={
            "area_id": area_response.json()["id"],
            "label": label,
            "capacity": capacity,
            "shape": "round",
        },
    )
    assert table_response.status_code == 201, table_response.text
    return area_response.json(), table_response.json()


@pytest.mark.asyncio
async def test_configuration_is_role_and_tenant_scoped(
    client: AsyncClient, db_session: AsyncSession
):
    _, _, _, owner_headers = await _tenant(db_session, slug="floor-owner")
    _, _, _, other_headers = await _tenant(db_session, slug="floor-other")
    area, table = await _area_and_table(client, owner_headers)

    owner_tables = await client.get("/api/floor-plan/tables", headers=owner_headers)
    other_tables = await client.get("/api/floor-plan/tables", headers=other_headers)
    cross_tenant_update = await client.patch(
        f"/api/floor-plan/tables/{table['id']}",
        headers=other_headers,
        json={"label": "Stolen"},
    )

    assert owner_tables.status_code == 200
    assert [item["label"] for item in owner_tables.json()] == ["T1"]
    assert other_tables.json() == []
    assert cross_tenant_update.status_code == 404
    assert area["location_id"] == table["location_id"]


@pytest.mark.asyncio
async def test_multiple_tables_require_configured_combination(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, location, headers = await _tenant(db_session, slug="combo")
    area, first = await _area_and_table(client, headers, capacity=2)
    second_response = await client.post(
        "/api/floor-plan/tables",
        headers=headers,
        json={"area_id": area["id"], "label": "T2", "capacity": 3},
    )
    second = second_response.json()
    customer = Customer(
        business_id=business.id,
        name="Guest",
        phone="+14155550100",
        email="guest@example.com",
    )
    service = ServiceType(business_id=business.id, name="Dinner", capacity=8)
    db_session.add_all([customer, service])
    await db_session.flush()
    reservation = Reservation(
        business_id=business.id,
        location_id=location.id,
        customer_id=customer.id,
        service_type_id=service.id,
        time=datetime.now(timezone.utc) + timedelta(days=1),
        ends_at=datetime.now(timezone.utc) + timedelta(days=1, hours=1),
        phone=customer.phone,
        email=customer.email,
        status="confirmed",
        guests=4,
    )
    db_session.add(reservation)
    await db_session.commit()

    rejected = await client.put(
        f"/api/floor-plan/reservations/{reservation.id}/tables",
        headers=headers,
        json={"table_ids": [first["id"], second["id"]]},
    )
    assert rejected.status_code == 409

    combination = await client.post(
        "/api/floor-plan/combinations",
        headers=headers,
        json={
            "name": "T1 + T2",
            "table_ids": [first["id"], second["id"]],
            "capacity_override": 4,
        },
    )
    assert combination.status_code == 201, combination.text
    assert combination.json()["effective_capacity"] == 4

    assigned = await client.put(
        f"/api/floor-plan/reservations/{reservation.id}/tables",
        headers=headers,
        json={"table_ids": [first["id"], second["id"]]},
    )
    assert assigned.status_code == 200, assigned.text
    assert set(assigned.json()["table_ids"]) == {first["id"], second["id"]}


@pytest.mark.asyncio
async def test_staff_capacity_override_is_forbidden(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, location, owner_headers = await _tenant(db_session, slug="capacity")
    _, table = await _area_and_table(client, owner_headers, capacity=2)
    staff_user = User(
        email="staff-capacity@example.com",
        name="Staff",
        password_hash="unused",
        user_type="staff",
    )
    db_session.add(staff_user)
    await db_session.flush()
    db_session.add(Staff(user_id=staff_user.id, business_id=business.id, role="staff"))
    queue_entry = QueueEntry(
        business_id=business.id,
        location_id=location.id,
        session_token="capacity-entry-token",
        name="Large Party",
        party_size=4,
        status="waiting",
    )
    db_session.add(queue_entry)
    await db_session.commit()
    staff_headers = {
        "Authorization": f"Bearer {create_access_token(str(staff_user.id), 'staff')}"
    }

    response = await client.put(
        f"/api/floor-plan/queue/{queue_entry.id}/tables",
        headers=staff_headers,
        json={
            "table_ids": [table["id"]],
            "capacity_override_reason": "Guest requested a compact arrangement",
        },
    )
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_closing_queue_seating_completes_visit_and_marks_table_cleaning(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, location, headers = await _tenant(db_session, slug="seating")
    _, table = await _area_and_table(client, headers, capacity=4)
    entry = QueueEntry(
        business_id=business.id,
        location_id=location.id,
        session_token="seating-entry-token",
        name="Walk In",
        party_size=3,
        status="waiting",
    )
    db_session.add(entry)
    await db_session.commit()

    opened = await client.post(
        "/api/floor-plan/seatings",
        headers=headers,
        json={
            "source_type": "queue",
            "source_id": str(entry.id),
            "table_ids": [table["id"]],
        },
    )
    assert opened.status_code == 201, opened.text
    assert opened.json()["status"] == "open"

    closed = await client.post(
        f"/api/floor-plan/seatings/{opened.json()['id']}/close",
        headers=headers,
    )
    assert closed.status_code == 200, closed.text
    await db_session.refresh(entry)
    assert entry.status == "completed"
    assert entry.completed_at is not None

    tables = await client.get("/api/floor-plan/tables", headers=headers)
    assert tables.json()[0]["operational_state"] == "cleaning"


@pytest.mark.asyncio
async def test_floor_plan_requires_an_operational_module(
    client: AsyncClient, db_session: AsyncSession
):
    _, _, _, headers = await _tenant(
        db_session, slug="no-floor-module", enabled_modules=["inventory"]
    )
    response = await client.get("/api/floor-plan/tables", headers=headers)
    assert response.status_code == 403
    assert response.json()["code"] == "MODULE_DISABLED"
