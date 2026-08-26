"""Reports must equal their ledgers, and must not call anything revenue.

A reporting bug is quiet: the page renders, the number looks plausible, and
nobody finds out until a manager acts on it. So each test builds a small ledger
by hand, asserts the report returns exactly the figure that ledger implies, and
then asserts the vocabulary constraint `docs/PRODUCT.md` places on it.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.customer import Customer
from app.models.location import Location
from app.models.table import Table
from app.models.table_area import TableArea
from app.models.table_seating import TableSeating, TableSeatingTable
from app.models.order import Order
from app.models.queue_entry import QueueEntry
from app.models.reservation import Reservation
from app.models.service_type import ServiceType
from app.models.staff import Staff
from app.models.tab import Tab, TabSettlementEvent
from app.models.user import User
from app.services.auth_service import create_access_token, hash_password

NOW = datetime.now(timezone.utc)
START = NOW - timedelta(days=7)
END = NOW + timedelta(days=1)
RANGE = {"start": START.isoformat(), "end": END.isoformat()}


async def _venue(
    db: AsyncSession, *, slug: str, role: str = "manager"
) -> tuple[str, str]:
    user = User(
        email=f"{slug}@example.com",
        name="Reports user",
        password_hash=hash_password("test-password-1234"),
        user_type="staff",
    )
    db.add(user)
    await db.flush()
    business = Business(
        name=f"Venue {slug}",
        slug=slug,
        email=f"venue-{slug}@example.com",
        phone="5550000000",
        enabled_modules=["reservations", "queue", "ordering", "inventory", "insights"],
        currency_code="EUR",
        onboarding_complete=True,
    )
    db.add(business)
    await db.flush()
    db.add(Staff(user_id=user.id, business_id=business.id, role=role))
    await db.flush()
    business_id, user_id = str(business.id), str(user.id)
    await db.commit()
    return business_id, create_access_token(user_id, "staff")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_reservation_outcomes_count_no_shows_as_their_own_outcome(
    client: AsyncClient, db_session: AsyncSession
):
    """A no-show is neither a completion nor a cancellation.

    The pre-stage-6 KPI resolved only completed and cancelled, so a venue with a
    no-show problem saw two rates that looked fine and no way to find it.
    """
    business_id, token = await _venue(db_session, slug="report-reservations")
    service_type = ServiceType(
        business_id=UUID(business_id),
        name="Table",
        capacity=6,
        max_concurrent_bookings=4,
        duration=60,
    )
    db_session.add(service_type)
    await db_session.flush()

    outcomes = ["completed", "completed", "cancelled", "no_show", "confirmed"]
    for index, status in enumerate(outcomes):
        customer = Customer(
            business_id=UUID(business_id),
            name=f"Guest {index}",
            phone=f"+491510000{index:04d}",
        )
        db_session.add(customer)
        await db_session.flush()
        booked_at = NOW - timedelta(hours=index + 1)
        db_session.add(
            Reservation(
                business_id=UUID(business_id),
                service_type_id=service_type.id,
                customer_id=customer.id,
                phone="+4915100000000",
                email=f"guest{index}@example.com",
                time=booked_at,
                ends_at=booked_at + timedelta(hours=1),
                guests=2,
                status=status,
                no_show_at=NOW if status == "no_show" else None,
            )
        )
    await db_session.commit()

    response = await client.get(
        "/api/reports/reservations", params=RANGE, headers=_auth(token)
    )
    assert response.status_code == 200, response.text
    report = response.json()

    assert report["booked"] == 5
    assert report["covers"] == 10
    assert report["completed"] == 2
    assert report["cancelled"] == 1
    assert report["no_shows"] == 1
    # 1 of 5 booked, reported as its own rate rather than folded into cancellations.
    assert report["no_show_rate_percent"] == 20.0
    assert report["cancellation_rate_percent"] == 20.0
    assert report["completion_rate_percent"] == 40.0


@pytest.mark.asyncio
async def test_an_empty_range_reports_no_rate_rather_than_zero_percent(
    client: AsyncClient, db_session: AsyncSession
):
    """"No bookings" and "no no-shows" are different facts.

    Rendering both as 0% would tell a manager their no-show problem is solved on
    a day the venue was closed.
    """
    _business_id, token = await _venue(db_session, slug="report-empty")
    response = await client.get(
        "/api/reports/reservations", params=RANGE, headers=_auth(token)
    )
    assert response.status_code == 200
    report = response.json()
    assert report["booked"] == 0
    assert report["no_show_rate_percent"] is None
    assert report["completion_rate_percent"] is None


@pytest.mark.asyncio
async def test_queue_wait_and_conversion_match_the_entry_timestamps(
    client: AsyncClient, db_session: AsyncSession
):
    business_id, token = await _venue(db_session, slug="report-queue")
    joined = NOW - timedelta(hours=2)
    # Two seated after 10 and 30 minutes; one removed without ever sitting.
    for index, (minutes, status) in enumerate(
        [(10, "seated"), (30, "completed"), (None, "removed")]
    ):
        db_session.add(
            QueueEntry(
                business_id=UUID(business_id),
                name="Walk-in",
                phone="+4915100000001",
                party_size=2,
                status=status,
                service_date=joined.date(),
                joined_at=joined,
                seated_at=joined + timedelta(minutes=minutes) if minutes else None,
                session_token_hash=f"{index:064x}",
            )
        )
    await db_session.commit()

    response = await client.get("/api/reports/queue", params=RANGE, headers=_auth(token))
    assert response.status_code == 200, response.text
    report = response.json()

    assert report["joined"] == 3
    assert report["seated"] == 2
    assert report["removed"] == 1
    assert report["seating_conversion_percent"] == 66.7
    assert report["average_wait_minutes"] == 20.0
    assert report["median_wait_minutes"] == 20.0
    assert report["longest_wait_minutes"] == 30.0


@pytest.mark.asyncio
async def test_the_three_value_figures_stay_separate_and_reconcile(
    client: AsyncClient, db_session: AsyncSession
):
    """Ordered, open-tab and externally settled value are three different numbers.

    The settled figure comes from `total_snapshot` — the immutable amount
    captured when the venue's register took payment — not from re-summing the
    orders. Here the orders total 70.00 while the snapshot says 65.00 (a comp
    applied at the register), and the report must report both truthfully rather
    than reconciling them into one.
    """
    business_id, token = await _venue(db_session, slug="report-value")
    customer = Customer(
        business_id=UUID(business_id), name="Guest", phone="+4915100000002"
    )
    db_session.add(customer)
    await db_session.flush()

    settled_tab = Tab(
        business_id=UUID(business_id),
        status="settled_externally",
        opened_at=NOW - timedelta(hours=3),
        closed_at=NOW - timedelta(hours=2),
    )
    open_tab = Tab(
        business_id=UUID(business_id),
        status="open",
        opened_at=NOW - timedelta(hours=1),
    )
    db_session.add_all([settled_tab, open_tab])
    await db_session.flush()

    for index, (tab, amount) in enumerate(
        [
            (settled_tab, "40.0000"),
            (settled_tab, "30.0000"),
            (open_tab, "25.0000"),
        ]
    ):
        db_session.add(
            Order(
                business_id=UUID(business_id),
                tab_id=tab.id,
                status="served",
                placed_at=NOW - timedelta(hours=2),
                subtotal_amount=Decimal(amount),
                total_amount=Decimal(amount),
                currency_code="EUR",
                session_token_hash=f"{index + 100:064x}",
                idempotency_key=f"report-value-order-{index}",
                request_fingerprint=f"{index + 200:064x}",
            )
        )

    db_session.add(
        TabSettlementEvent(
            business_id=UUID(business_id),
            tab_id=settled_tab.id,
            event_type="settled_externally",
            occurred_at=NOW - timedelta(hours=2),
            currency_code="EUR",
            total_snapshot=Decimal("65.0000"),
            informational_method="card",
        )
    )
    await db_session.commit()

    response = await client.get("/api/reports/value", params=RANGE, headers=_auth(token))
    assert response.status_code == 200, response.text
    report = response.json()

    # Every order placed in the window, settled or not.
    assert Decimal(str(report["ordered_value"])) == Decimal("95.0000")
    # Only what is still on an unsettled tab.
    assert Decimal(str(report["open_tab_value"])) == Decimal("25.0000")
    # The register's own figure, which is deliberately not the order sum.
    assert Decimal(str(report["externally_settled_value"])) == Decimal("65.0000")
    assert report["settlements"] == 1

    # The three are never combined into a total.
    assert "total_value" not in report

    # No *figure* may be named revenue, accounting output or a fiscal total. The
    # disclosure strings are exempt from this scan because their whole job is to
    # say the words in the negative — "none of them is revenue" is the wording
    # PRODUCT.md asks for, and a blanket substring ban would forbid saying it.
    disclosure_keys = {"disclosure", "value_disclosure"}
    def field_names(node, path=""):
        if isinstance(node, dict):
            for key, value in node.items():
                if key in disclosure_keys:
                    continue
                yield key
                yield from field_names(value, f"{path}.{key}")
        elif isinstance(node, list):
            for item in node:
                yield from field_names(item, path)

    for name in field_names(report):
        for forbidden_word in ["revenue", "accounting", "fiscal", "profit", "income"]:
            assert forbidden_word not in name.lower(), (
                f"the value report named a field {name!r}"
            )

    # And the disclosure has to actually make the disclaimer, not just omit it.
    assert "none of them is revenue" in report["value_disclosure"].lower()
    assert "ordered value" in report["value_disclosure"].lower()
    assert "externally settled value" in report["value_disclosure"].lower()


@pytest.mark.asyncio
async def test_value_csv_labels_each_figure_and_never_totals_them(
    client: AsyncClient, db_session: AsyncSession
):
    _business_id, token = await _venue(db_session, slug="report-value-csv")
    response = await client.get(
        "/api/reports/value.csv", params=RANGE, headers=_auth(token)
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    # Guest and cost data must not sit in a shared cache.
    assert response.headers["cache-control"] == "private, no-store"

    rows = response.text.strip().splitlines()
    assert rows[0] == "figure,amount,currency_code,count,note"
    assert len(rows) == 4, "exactly the three figures, with no total row"
    assert "Ordered value" in response.text
    assert "Open-tab value" in response.text
    assert "Externally settled value" in response.text


@pytest.mark.asyncio
async def test_every_report_route_answers_over_a_populated_ledger(
    client: AsyncClient, db_session: AsyncSession
):
    """Build the query, not just the guard.

    A report whose only test asserts a 403 never runs its SQL, so a column that
    does not exist on the model passes every service-level test and 500s on the
    first real request. That is exactly how stage 5's receipt-builder defect
    reached a live journey, and how `Table.name` (the column is `label`) and
    `PurchaseReceiptLine.item_id` (it is `inventory_item_id`) reached one here.
    Every route is called with data present, and every response is parsed.
    """
    business_id, token = await _venue(db_session, slug="report-all-routes")

    # A seating on a real table, so the utilization join has rows to walk.
    location = Location(
        business_id=UUID(business_id), name="Main room", is_primary=True
    )
    db_session.add(location)
    await db_session.flush()
    area = TableArea(
        business_id=UUID(business_id), location_id=location.id, name="Bar"
    )
    db_session.add(area)
    await db_session.flush()
    table = Table(
        business_id=UUID(business_id),
        location_id=location.id,
        area_id=area.id,
        label="T1",
        capacity=4,
    )
    db_session.add(table)
    await db_session.flush()
    # A seating references exactly one source (CHECK since stage 3), so this
    # also exercises the walk-in half of the booked-vs-walk-in split.
    walk_in = QueueEntry(
        business_id=UUID(business_id),
        name="Walk-in",
        phone="+4915100000020",
        party_size=3,
        status="seated",
        service_date=(NOW - timedelta(hours=3)).date(),
        joined_at=NOW - timedelta(hours=4),
        seated_at=NOW - timedelta(hours=3),
        session_token_hash=f"{999:064x}",
    )
    db_session.add(walk_in)
    await db_session.flush()
    seating = TableSeating(
        business_id=UUID(business_id),
        location_id=location.id,
        queue_entry_id=walk_in.id,
        party_size=3,
        status="closed",
        opened_at=NOW - timedelta(hours=3),
        closed_at=NOW - timedelta(hours=1),
    )
    db_session.add(seating)
    await db_session.flush()
    db_session.add(
        TableSeatingTable(seating_id=seating.id, table_id=table.id)
    )
    await db_session.commit()

    routes = [
        "/api/reports/reservations",
        "/api/reports/queue",
        "/api/reports/tables",
        "/api/reports/stations",
        "/api/reports/value",
        "/api/reports/stock",
        "/api/reports/purchasing",
        "/api/reports/cogs",
        "/api/reports/staff-actions",
        "/api/reports/tables.csv",
        "/api/reports/stations.csv",
        "/api/reports/value.csv",
        "/api/reports/stock.csv",
        "/api/reports/purchasing.csv",
        "/api/reports/staff-actions.csv",
    ]
    for path in routes:
        response = await client.get(path, params=RANGE, headers=_auth(token))
        assert response.status_code == 200, f"{path} -> {response.status_code}: {response.text[:400]}"

    # And the seating actually reached the utilization report, so the join is
    # exercised rather than merely compiled.
    tables_report = await client.get(
        "/api/reports/tables", params=RANGE, headers=_auth(token)
    )
    body = tables_report.json()
    assert body["seatings"] == 1
    assert body["covers"] == 3
    assert body["tables"][0]["table_name"] == "T1"
    # Opened 3h ago, closed 1h ago.
    assert body["tables"][0]["average_turn_minutes"] == 120.0
    assert body["by_source"]["queue"] == {"seatings": 1, "covers": 3}


@pytest.mark.asyncio
async def test_reports_refuse_a_backwards_range(
    client: AsyncClient, db_session: AsyncSession
):
    _business_id, token = await _venue(db_session, slug="report-bad-range")
    response = await client.get(
        "/api/reports/reservations",
        params={"start": END.isoformat(), "end": START.isoformat()},
        headers=_auth(token),
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_reports_are_tenant_scoped(client: AsyncClient, db_session: AsyncSession):
    """A report must never read across the tenant boundary.

    Business identity comes from the token, so business B's data simply cannot
    appear — the assertion is that A's report is empty rather than that a path
    parameter was refused.
    """
    _a_id, a_token = await _venue(db_session, slug="report-tenant-a")
    b_id, _b_token = await _venue(db_session, slug="report-tenant-b")

    service_type = ServiceType(
        business_id=UUID(b_id),
        name="Table",
        capacity=4,
        max_concurrent_bookings=2,
        duration=60,
    )
    db_session.add(service_type)
    await db_session.flush()
    other_guest = Customer(
        business_id=UUID(b_id), name="Other tenant guest", phone="+4915100000003"
    )
    db_session.add(other_guest)
    await db_session.flush()
    booked_at = NOW - timedelta(hours=1)
    db_session.add(
        Reservation(
            business_id=UUID(b_id),
            service_type_id=service_type.id,
            customer_id=other_guest.id,
            phone="+4915100000003",
            email="other@example.com",
            time=booked_at,
            ends_at=booked_at + timedelta(hours=1),
            guests=4,
            status="completed",
        )
    )
    await db_session.commit()

    response = await client.get(
        "/api/reports/reservations", params=RANGE, headers=_auth(a_token)
    )
    assert response.status_code == 200
    assert response.json()["booked"] == 0, "business A saw business B's bookings"


@pytest.mark.asyncio
async def test_cost_reports_are_closed_to_the_floor(
    client: AsyncClient, db_session: AsyncSession
):
    """Cost and staff-action reports are manager information.

    Stage 5 already established this for the cost-control endpoints; the report
    surface must not become a way around it.
    """
    for role in ["host_server", "bar_kitchen", "inventory_operator"]:
        _business_id, token = await _venue(db_session, slug=f"report-role-{role}", role=role)
        for path in [
            "/api/reports/reservations",
            "/api/reports/stock",
            "/api/reports/purchasing",
            "/api/reports/staff-actions",
        ]:
            response = await client.get(path, params=RANGE, headers=_auth(token))
            assert response.status_code == 403, f"{role} read {path}"
            assert response.json()["code"] == "FORBIDDEN"
