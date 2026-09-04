from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.customer import Customer
from app.models.location import Location
from app.models.menu import Menu, MenuCategory, MenuItem
from app.models.order import Order
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.models.staff import Staff
from app.models.table import Table
from app.models.tab import Tab
from app.models.user import User
from app.services.auth_service import create_access_token
from app.services.floor_plan_service import resolve_service_window
from app.services import tax_service
from app.services.public_session_service import hash_token


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
    await tax_service.create_default_profiles(db, business, actor_id=user.id)
    location = Location(
        business_id=business.id,
        name="Main",
        is_primary=True,
    )
    db.add_all([location, Staff(user_id=user.id, business_id=business.id, role=role)])
    await db.commit()
    token = create_access_token(str(user.id), "staff")
    return business, user, location, {"Authorization": f"Bearer {token}"}


async def _table_in_area(client, headers, area_id, *, label, capacity=2):
    response = await client.post(
        "/api/floor-plan/tables",
        headers=headers,
        json={
            "area_id": area_id,
            "label": label,
            "capacity": capacity,
            "shape": "round",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


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

    fetched = await client.get(
        f"/api/floor-plan/reservations/{reservation.id}/tables",
        headers=headers,
    )
    assert fetched.status_code == 200
    assert set(fetched.json()["table_ids"]) == {first["id"], second["id"]}

    removed = await client.delete(
        f"/api/floor-plan/reservations/{reservation.id}/tables",
        headers=headers,
    )
    assert removed.status_code == 204
    missing = await client.get(
        f"/api/floor-plan/reservations/{reservation.id}/tables",
        headers=headers,
    )
    assert missing.status_code == 404


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
    db_session.add(Staff(user_id=staff_user.id, business_id=business.id, role="host_server"))
    queue_entry = QueueEntry(
        business_id=business.id,
        location_id=location.id,
        session_token_hash=hash_token("capacity-entry-token"),
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
async def test_closing_queue_seating_completes_visit_and_returns_table_to_ready(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, location, headers = await _tenant(db_session, slug="seating")
    _, table = await _area_and_table(client, headers, capacity=4)
    entry = QueueEntry(
        business_id=business.id,
        location_id=location.id,
        session_token_hash=hash_token("seating-entry-token"),
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
    assert tables.json()[0]["operational_state"] == "ready"


@pytest.mark.asyncio
async def test_host_can_plan_a_later_reservation_while_the_table_is_occupied(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, location, headers = await _tenant(db_session, slug="host-loop")
    _, table = await _area_and_table(client, headers, capacity=4)
    service = ServiceType(
        business_id=business.id,
        name="Dinner",
        capacity=4,
        resource_turn_buffer_minutes=30,
    )
    customer = Customer(
        business_id=business.id,
        name="Current Guest",
        phone="+14155550110",
        email="current@example.com",
    )
    later_customer = Customer(
        business_id=business.id,
        name="Later Guest",
        phone="+14155550111",
        email="later@example.com",
    )
    db_session.add_all([service, customer, later_customer])
    await db_session.flush()
    now = datetime.now(timezone.utc)
    current = Reservation(
        business_id=business.id,
        location_id=location.id,
        customer_id=customer.id,
        service_type_id=service.id,
        time=now - timedelta(minutes=5),
        ends_at=now + timedelta(minutes=55),
        phone=customer.phone,
        email=customer.email,
        status="confirmed",
        guests=2,
    )
    later = Reservation(
        business_id=business.id,
        location_id=location.id,
        customer_id=later_customer.id,
        service_type_id=service.id,
        time=now + timedelta(hours=2),
        ends_at=now + timedelta(hours=3),
        phone=later_customer.phone,
        email=later_customer.email,
        status="confirmed",
        guests=2,
    )
    db_session.add_all([current, later])
    await db_session.commit()

    opened = await client.post(
        "/api/floor-plan/seatings",
        headers=headers,
        json={
            "source_type": "reservation",
            "source_id": str(current.id),
            "table_ids": [table["id"]],
        },
    )
    assert opened.status_code == 201, opened.text

    planned = await client.put(
        f"/api/floor-plan/reservations/{later.id}/tables",
        headers=headers,
        json={"table_ids": [table["id"]]},
    )
    assert planned.status_code == 200, planned.text

    closed = await client.post(
        f"/api/floor-plan/seatings/{opened.json()['id']}/close",
        headers=headers,
    )
    assert closed.status_code == 200, closed.text
    tables = await client.get("/api/floor-plan/tables", headers=headers)
    assert tables.json()[0]["operational_state"] == "ready"


@pytest.mark.asyncio
async def test_qr_orders_use_one_active_seating_tab_and_require_settlement_before_departure(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, location, headers = await _tenant(db_session, slug="qr-flow")
    _, table = await _area_and_table(client, headers, capacity=4)
    service = ServiceType(business_id=business.id, name="Dinner", capacity=4)
    customer = Customer(
        business_id=business.id,
        name="QR Guest",
        phone="+14155550112",
        email="qr@example.com",
    )
    menu = Menu(business_id=business.id, name="Drinks", is_active=True)
    db_session.add_all([service, customer, menu])
    await db_session.flush()
    category = MenuCategory(menu_id=menu.id, business_id=business.id, name="Beer")
    db_session.add(category)
    await db_session.flush()
    tax_profiles = await tax_service.list_profiles(db_session, business.id)
    item = MenuItem(
        category_id=category.id,
        business_id=business.id,
        name="Lager",
        price=7,
        tax_profile_id=tax_profiles[0].id,
        routing_tag="bar",
    )
    reservation = Reservation(
        business_id=business.id,
        location_id=location.id,
        customer_id=customer.id,
        service_type_id=service.id,
        time=datetime.now(timezone.utc) - timedelta(minutes=5),
        ends_at=datetime.now(timezone.utc) + timedelta(hours=1),
        phone=customer.phone,
        email=customer.email,
        status="confirmed",
        guests=2,
    )
    db_session.add_all([item, reservation])
    await db_session.commit()
    business_id = str(business.id)
    item_id = str(item.id)
    reservation_id = str(reservation.id)

    opened = await client.post(
        "/api/floor-plan/seatings",
        headers=headers,
        json={
            "source_type": "reservation",
            "source_id": reservation_id,
            "table_ids": [table["id"]],
        },
    )
    assert opened.status_code == 201, opened.text
    seating_id = opened.json()["id"]

    qr = await client.get(f"/api/floor-plan/tables/{table['id']}/qr", headers=headers)
    assert qr.status_code == 200, qr.text
    token = qr.json()["url"].split("table_token=", 1)[1]
    payload = {
        "items": [{"item_id": item_id, "quantity": 1}],
        "idempotency_key": "qr-order-one",
    }
    missing_approval = await client.post(
        f"/api/ordering/{business_id}/orders",
        json={**payload, "idempotency_key": "missing-approval"},
    )
    assert missing_approval.status_code == 401

    pending = await client.post(
        f"/api/ordering/{business_id}/table-sessions",
        json={"table_token": token, "browser_nonce": "browser-nonce-00000000000000000001"},
    )
    assert pending.status_code == 201, pending.text
    assert pending.json()["status"] == "pending"
    photographed_qr = await client.post(
        f"/api/ordering/{business_id}/orders",
        json={**payload, "idempotency_key": "pending-browser"},
    )
    assert photographed_qr.status_code == 422

    pending_sessions = await client.get(
        "/api/floor-plan/table-guest-sessions",
        headers=headers,
        params={"status": "pending"},
    )
    assert pending_sessions.status_code == 200, pending_sessions.text
    approved = await client.post(
        f"/api/floor-plan/table-guest-sessions/{pending_sessions.json()[0]['id']}/approve",
        headers=headers,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    first = await client.post(f"/api/ordering/{business_id}/orders", json=payload)
    second = await client.post(
        f"/api/ordering/{business_id}/orders",
        json={**payload, "idempotency_key": "qr-order-two"},
    )
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert "table_id" not in first.json()
    assert "tab_id" not in first.json()

    first_order = await db_session.scalar(
        select(Order).where(
            Order.business_id == business.id,
            Order.idempotency_key == "qr-order-one",
        )
    )
    assert first_order is not None
    tab_id = first_order.tab_id
    tab = await db_session.get(Tab, tab_id)
    assert tab is not None and str(tab.seating_id) == seating_id and tab.opened_by is None
    orders = list((await db_session.execute(select(Order).where(Order.tab_id == tab_id))).scalars())
    assert len(orders) == 2
    assert all(order.table_identifier is None for order in orders)

    blocked_close = await client.post(
        f"/api/floor-plan/seatings/{seating_id}/close", headers=headers
    )
    assert blocked_close.status_code == 409
    settled = await client.post(
        f"/api/tabs/{tab_id}/settle-externally",
        headers=headers,
        json={
            "idempotency_key": "settle-qr-tab-1",
            "informational_method": "card",
        },
    )
    assert settled.status_code == 200, settled.text
    closed = await client.post(
        f"/api/floor-plan/seatings/{seating_id}/close", headers=headers
    )
    assert closed.status_code == 200, closed.text

    rotated = await client.post(
        f"/api/floor-plan/tables/{table['id']}/qr/rotate", headers=headers
    )
    assert rotated.status_code == 200
    stale = await client.post(
        f"/api/ordering/{business_id}/orders",
        json={**payload, "idempotency_key": "stale-token"},
    )
    assert stale.status_code == 422


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


@pytest.mark.asyncio
async def test_settings_are_manager_owned_and_service_day_is_business_local(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, _, owner_headers = await _tenant(
        db_session, slug="service-day"
    )
    staff_user = User(
        email="service-day-staff@example.com",
        name="Staff",
        password_hash="unused",
        user_type="staff",
    )
    db_session.add(staff_user)
    await db_session.flush()
    db_session.add(
        Staff(user_id=staff_user.id, business_id=business.id, role="host_server")
    )
    await db_session.commit()
    staff_headers = {
        "Authorization": f"Bearer {create_access_token(str(staff_user.id), 'staff')}"
    }

    forbidden = await client.put(
        "/api/floor-plan/settings",
        headers=staff_headers,
        json={"service_day_cutoff": "04:30:00"},
    )
    updated = await client.put(
        "/api/floor-plan/settings",
        headers=owner_headers,
        json={"service_day_cutoff": "04:30:00"},
    )

    assert forbidden.status_code == 403
    assert updated.status_code == 200
    assert updated.json()["service_day_cutoff"] == "04:30:00"
    timezone_bearing = await client.put(
        "/api/floor-plan/settings",
        headers=owner_headers,
        json={"service_day_cutoff": "04:30:00+03:00"},
    )
    assert timezone_bearing.status_code == 422

    business.timezone = "Europe/Amsterdam"
    business.service_day_cutoff = time(5, 0)
    resolved, starts_at, ends_at = resolve_service_window(
        business,
        now=datetime(2026, 7, 28, 0, 30, tzinfo=timezone.utc),
    )
    assert resolved == date(2026, 7, 27)

    _, dst_start, dst_end = resolve_service_window(
        business,
        service_date=date(2026, 3, 28),
    )
    assert dst_end - dst_start == timedelta(hours=23)


@pytest.mark.asyncio
async def test_board_projects_assignments_seatings_and_unassigned_parties(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, location, headers = await _tenant(db_session, slug="host-board")
    _, table = await _area_and_table(client, headers, capacity=4)
    now = datetime.now(timezone.utc)
    customer = Customer(
        business_id=business.id,
        name="Reserved Guest",
        phone="+14155550199",
        email="board-guest@example.com",
    )
    service = ServiceType(business_id=business.id, name="Dinner", capacity=8)
    db_session.add_all([customer, service])
    await db_session.flush()
    reservation = Reservation(
        business_id=business.id,
        location_id=location.id,
        customer_id=customer.id,
        service_type_id=service.id,
        time=now - timedelta(minutes=15),
        ends_at=now + timedelta(minutes=45),
        phone=customer.phone,
        email=customer.email,
        status="confirmed",
        guests=3,
    )
    queue_entry = QueueEntry(
        business_id=business.id,
        location_id=location.id,
        service_date=resolve_service_window(business, now=now)[0],
        session_token_hash=hash_token("board-entry-token"),
        name="Walk In",
        party_size=2,
        status="waiting",
    )
    db_session.add_all([reservation, queue_entry])
    await db_session.commit()

    assigned = await client.put(
        f"/api/floor-plan/reservations/{reservation.id}/tables",
        headers=headers,
        json={"table_ids": [table["id"]]},
    )
    assert assigned.status_code == 200, assigned.text

    board = await client.get("/api/floor-plan/board", headers=headers)
    assert board.status_code == 200, board.text
    body = board.json()
    projected_table = body["areas"][0]["tables"][0]
    assert projected_table["display_state"] == "reserved"
    assert projected_table["active_assignment"]["name"] == "Reserved Guest"
    assert body["unassigned_reservations"] == []
    assert body["queue_entries"][0]["name"] == "Walk In"
    assert body["queue_entries"][0]["assigned_table_ids"] == []

    opened = await client.post(
        "/api/floor-plan/seatings",
        headers=headers,
        json={
            "source_type": "reservation",
            "source_id": str(reservation.id),
            "table_ids": [table["id"]],
        },
    )
    assert opened.status_code == 201, opened.text
    occupied = await client.get("/api/floor-plan/board", headers=headers)
    projected_table = occupied.json()["areas"][0]["tables"][0]
    assert projected_table["display_state"] == "occupied"
    assert projected_table["active_seating"]["source"]["source_id"] == str(
        reservation.id
    )


@pytest.mark.asyncio
async def test_secondary_location_board_does_not_claim_legacy_unscoped_parties(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, _, headers = await _tenant(db_session, slug="location-board")
    secondary = Location(
        business_id=business.id,
        name="Second",
        is_primary=False,
    )
    db_session.add(secondary)
    await db_session.flush()
    legacy_entry = QueueEntry(
        business_id=business.id,
        location_id=None,
        service_date=resolve_service_window(business)[0],
        session_token_hash=hash_token("legacy-location-token"),
        name="Legacy Party",
        party_size=2,
        status="waiting",
    )
    db_session.add(legacy_entry)
    await db_session.commit()

    primary_board = await client.get("/api/floor-plan/board", headers=headers)
    secondary_board = await client.get(
        "/api/floor-plan/board",
        headers=headers,
        params={"location_id": str(secondary.id)},
    )

    assert [item["name"] for item in primary_board.json()["queue_entries"]] == [
        "Legacy Party"
    ]
    assert secondary_board.json()["queue_entries"] == []


@pytest.mark.asyncio
async def test_table_qr_sheet_lists_every_printable_table_and_excludes_the_rest(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, _, headers = await _tenant(db_session, slug="qr-sheet")
    area, printable = await _area_and_table(client, headers, label="P1")
    archived = await _table_in_area(client, headers, area["id"], label="A1")
    deactivated = await _table_in_area(client, headers, area["id"], label="D1")

    archive = await client.delete(
        f"/api/floor-plan/tables/{archived['id']}", headers=headers
    )
    assert archive.status_code == 204

    # No HTTP route produces an inactive-but-not-deleted table: DELETE archives
    # by setting both `is_active` and `deleted_at`. The sheet still has to skip
    # this state, so the row is put there directly.
    row = await db_session.get(Table, UUID(deactivated["id"]))
    row.is_active = False
    await db_session.commit()

    other_business, _, _, other_headers = await _tenant(
        db_session, slug="qr-sheet-neighbour"
    )
    await _area_and_table(client, other_headers, label="N1")

    response = await client.get("/api/floor-plan/tables/qr", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["business_id"] == str(business.id)
    labels = [
        table["label"] for sheet_area in body["areas"] for table in sheet_area["tables"]
    ]
    assert labels == ["P1"]

    entry = body["areas"][0]["tables"][0]
    assert body["areas"][0]["id"] == area["id"]
    assert entry["table_id"] == printable["id"]
    assert entry["revision"] == 1
    assert entry["url"].startswith(f"/menu/{business.slug}#table_token=")

    # The neighbour's sheet carries only the neighbour's table.
    other = await client.get("/api/floor-plan/tables/qr", headers=other_headers)
    assert other.status_code == 200
    assert [
        table["label"] for sheet_area in other.json()["areas"] for table in sheet_area["tables"]
    ] == ["N1"]

    # The sheet URL is the same URL the single-table dialog hands out.
    single = await client.get(
        f"/api/floor-plan/tables/{printable['id']}/qr", headers=headers
    )
    assert single.status_code == 200
    assert single.json() == entry


@pytest.mark.asyncio
async def test_table_qr_sheet_is_a_read_and_never_rotates_a_revision(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, _, headers = await _tenant(db_session, slug="qr-sheet-idempotent")
    area, _ = await _area_and_table(client, headers, label="R1")
    second = await _table_in_area(client, headers, area["id"], label="R2")

    # Rotate one table first, so the assertion covers a revision that is not 1
    # and cannot pass by every row happening to sit at its default.
    rotated = await client.post(
        f"/api/floor-plan/tables/{second['id']}/qr/rotate", headers=headers
    )
    assert rotated.status_code == 200

    # Read as columns, never through the identity map, so the assertion is
    # about what is in the database rather than what this session remembers.
    business_id = business.id

    async def revisions() -> list[tuple[str, int]]:
        result = await db_session.execute(
            select(Table.label, Table.qr_token_revision)
            .where(Table.business_id == business_id)
            .order_by(Table.label)
        )
        return [(label, revision) for label, revision in result.all()]

    before = await revisions()
    assert before == [("R1", 1), ("R2", 2)]

    first_call = await client.get("/api/floor-plan/tables/qr", headers=headers)
    second_call = await client.get("/api/floor-plan/tables/qr", headers=headers)

    assert first_call.status_code == 200
    assert second_call.status_code == 200
    assert await revisions() == before
    assert first_call.json() == second_call.json()


@pytest.mark.asyncio
async def test_table_qr_sheet_requires_floor_configure(
    client: AsyncClient, db_session: AsyncSession
):
    business, _, _, owner_headers = await _tenant(db_session, slug="qr-sheet-role")
    await _area_and_table(client, owner_headers, label="C1")
    staff_user = User(
        email="qr-sheet-staff@example.com",
        name="Staff",
        password_hash="unused",
        user_type="staff",
    )
    db_session.add(staff_user)
    await db_session.flush()
    db_session.add(
        Staff(user_id=staff_user.id, business_id=business.id, role="host_server")
    )
    await db_session.commit()
    staff_headers = {
        "Authorization": f"Bearer {create_access_token(str(staff_user.id), 'staff')}"
    }

    forbidden = await client.get("/api/floor-plan/tables/qr", headers=staff_headers)
    allowed = await client.get("/api/floor-plan/tables/qr", headers=owner_headers)

    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"
    assert allowed.status_code == 200
