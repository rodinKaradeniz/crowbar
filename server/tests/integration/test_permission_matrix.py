"""The stage-6 exit gate, proved against the live HTTP surface.

Three separate claims, each of which has to hold on its own:

1.  **Inventory.** Every authenticated route names a capability, or is on a
    short recorded exemption list. A new route cannot default open, because a
    route with no guard fails here rather than shipping.
2.  **Coverage.** For a representative route per capability, the roles the
    matrix says hold it are *not* refused, and every role the matrix says does
    not hold it *is* refused with 403 FORBIDDEN. Both halves matter: a matrix
    that denies everyone passes a deny-only test.
3.  **Escalation.** A role cannot widen its own reach, a manager cannot reach
    owner, and a demotion takes effect for a session that is already open.

These hit HTTP rather than `has_capability` directly, because a correct matrix
wired to the wrong route is exactly the failure mode a unit test misses.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import (
    CAPABILITIES,
    ROLES,
    capabilities_for,
    has_capability,
)
from app.models.business import Business
from app.models.location import Location
from app.models.staff import Staff
from app.models.user import User
from app.services.auth_service import create_access_token, hash_password

ALL_MODULES = ["reservations", "queue", "ordering", "inventory", "insights"]


class _Ctx:
    """Ids only. Holding ORM objects across the helper's commit invites a lazy
    reload against an expired instance, which shows up as a confusing
    NotNullViolation rather than as the detachment it actually is."""

    def __init__(self, business_id: str, user_id: str):
        self.business_id = business_id
        self.user_id = user_id


async def _staff(
    db: AsyncSession,
    *,
    role: str,
    slug: str,
    business_id: str | None = None,
) -> tuple[_Ctx, str]:
    """A signed-in staff member holding `role`, with every module enabled.

    Modules are all on deliberately: this file is about roles, and a module gate
    firing first would mask a missing capability guard behind a 403 that means
    something else.
    """
    user = User(
        email=f"{slug}@example.com",
        name=f"{role} user",
        password_hash=hash_password("test-password-1234"),
        user_type="staff",
    )
    db.add(user)
    await db.flush()

    if business_id is None:
        business = Business(
            name=f"Venue {slug}",
            slug=slug,
            email=f"venue-{slug}@example.com",
            phone="5550000000",
            enabled_modules=list(ALL_MODULES),
            currency_code="EUR",
            onboarding_complete=True,
        )
        db.add(business)
        await db.flush()
        # The queue refuses to open without a primary location, so a fixture
        # without one turns a permission test into a policy test.
        db.add(
            Location(
                business_id=business.id,
                name="Main room",
                is_primary=True,
            )
        )
        await db.flush()
    else:
        business = await db.get(Business, business_id)

    db.add(Staff(user_id=user.id, business_id=business.id, role=role))
    await db.flush()
    user_id = str(user.id)
    business_id = str(business.id)
    await db.commit()
    return _Ctx(business_id, user_id), create_access_token(user_id, "staff")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ─── 1. Inventory ────────────────────────────────────────────────────────────


def test_every_authenticated_route_names_a_capability():
    """No route may reach tenant data without a deliberate capability.

    The generator is the same one that writes `docs/permission-matrix.md`, so
    this failing means the checked-in matrix is also wrong.
    """
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    from generate_permission_matrix import collect, uncovered  # noqa: E402

    gaps = uncovered(collect())
    assert not gaps, "Routes reachable by any signed-in staff member: " + ", ".join(
        f"{r['method']} {r['path']}" for r in gaps
    )


def test_every_capability_is_held_by_someone_and_reachable():
    """A capability nobody holds, or that no route asks for, is dead weight."""
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    from generate_permission_matrix import collect  # noqa: E402

    asked_for: set[str] = set()
    for row in collect():
        asked_for |= row["capabilities"]

    unreachable = set(CAPABILITIES) - asked_for
    assert not unreachable, f"Capabilities no route asks for: {sorted(unreachable)}"

    for capability in CAPABILITIES:
        holders = [r for r in ROLES if capability in capabilities_for(r)]
        assert holders, f"No role holds {capability}"


# ─── 2. Coverage ─────────────────────────────────────────────────────────────

# One representative route per capability, chosen so a GET is a genuine read and
# a write is refused before it mutates anything. `expect_allowed` means "not
# 403" — a 404 or 422 still proves the guard let the caller through, which is
# what is under test here.
PROBES: list[tuple[str, str, str, dict | None]] = [
    ("overview.view", "GET", "/api/analytics/business/{business_id}", None),
    ("reservations.view", "GET", "/api/reservations/business/{business_id}", None),
    ("reservations.override", "GET", "/api/reservations/override-times", None),
    ("reservations.configure", "GET", "/api/booking-schedules/default/operating-hours-preview", None),
    ("queue.view", "GET", "/api/queue/entries", None),
    ("queue.configure", "PUT", "/api/queue/service-day", {"status": "open"}),
    ("floor.view", "GET", "/api/floor-plan/board", None),
    ("floor.configure", "PUT", "/api/floor-plan/settings", {"auto_assign_enabled": False}),
    ("orders.view", "GET", "/api/ordering/{business_id}/orders", None),
    ("menu.view", "GET", "/api/ordering/{business_id}/menus", None),
    ("menu.configure", "POST", "/api/ordering/{business_id}/menus", {"name": "Probe"}),
    ("menu.pricing", "POST", "/api/tax-profiles", {"code": "PROBE"}),
    ("stations.configure", "POST", "/api/ordering/stations", {"name": "Probe"}),
    ("happyhour.manage", "POST", "/api/happy-hour/windows", {"name": "Probe"}),
    ("tabs.view", "GET", "/api/tabs", None),
    ("inventory.view", "GET", "/api/inventory/{business_id}/items", None),
    ("inventory.items.manage", "POST", "/api/inventory/{business_id}/items", {"name": "Probe"}),
    ("inventory.counts.manage", "POST", "/api/inventory/{business_id}/counts", {"kind": "stocktake"}),
    ("inventory.cost.view", "GET", "/api/inventory/{business_id}/cost-control", None),
    ("purchasing.view", "GET", "/api/purchasing/{business_id}/suppliers", None),
    ("purchasing.suppliers.manage", "POST", "/api/purchasing/{business_id}/suppliers", {"name": "Probe"}),
    ("purchasing.order.create", "POST", "/api/purchasing/{business_id}/purchase-orders", {"supplier_id": None}),
    ("customers.view", "GET", "/api/customers", None),
    ("customers.privacy", "GET", "/api/customers/{business_id}/export", None),
    ("reports.service", "GET", "/api/analytics/business/{business_id}/kpis", None),
    ("insights.view", "GET", "/api/analytics/business/{business_id}/high-risk", None),
    ("staff.view", "GET", "/api/staff/business/{business_id}", None),
    ("staff.manage", "GET", "/api/staff/invitations", None),
    ("business.configure", "GET", "/api/businesses/{business_id}/regional-audit", None),
    ("business.delete", "DELETE", "/api/businesses/{business_id}", None),
]


@pytest.mark.parametrize("capability,method,template,body", PROBES)
@pytest.mark.parametrize("role", ROLES)
@pytest.mark.asyncio
async def test_route_matches_its_matrix_row(
    client: AsyncClient,
    db_session: AsyncSession,
    role: str,
    capability: str,
    method: str,
    template: str,
    body: dict | None,
):
    ctx, token = await _staff(
        db_session,
        role=role,
        slug=f"probe-{role}-{capability.replace('.', '-')}-{method.lower()}",
    )
    path = template.replace("{business_id}", ctx.business_id)

    response = await client.request(method, path, json=body, headers=_auth(token))
    holds = capability in capabilities_for(role)

    if holds:
        assert response.status_code != 403, (
            f"{role} holds {capability} but {method} {template} refused it: "
            f"{response.text}"
        )
    else:
        assert response.status_code == 403, (
            f"{role} does not hold {capability} yet {method} {template} returned "
            f"{response.status_code}"
        )
        payload = response.json()
        assert payload["code"] == "FORBIDDEN"
        assert payload["details"]["required_capability"] == capability
        assert payload["details"]["current_role"] == role


@pytest.mark.asyncio
async def test_the_overview_hides_its_money_figure_from_roles_without_reports(
    client: AsyncClient, db_session: AsyncSession
):
    """Every role lands on Overview; not every role may read the day's takings.

    The route is `overview.view`, so a bartender reaches it. The ordered-value
    figure is a different question and is dropped from the payload rather than
    being sent and hidden in the UI.
    """
    for role, expect_figure in [("manager", True), ("bar_kitchen", False)]:
        ctx, token = await _staff(
            db_session, role=role, slug=f"overview-{role}"
        )
        response = await client.get(
            f"/api/analytics/business/{ctx.business_id}", headers=_auth(token)
        )
        assert response.status_code == 200, response.text
        ops = response.json()["ops"]
        assert ("ordered_value_today" in ops) is expect_figure, (
            f"{role} should {'' if expect_figure else 'not '}see ordered value"
        )


@pytest.mark.asyncio
async def test_settling_a_tab_is_open_to_the_floor_but_reopening_is_not(
    client: AsyncClient, db_session: AsyncSession
):
    """The two halves of external settlement sit on opposite sides of the line.

    Recording that the venue's register took payment is what a bartender does at
    the end of a round. Reopening a settled tab rewrites that assertion, so it
    stays managerial.
    """
    ctx, token = await _staff(
        db_session, role="bar_kitchen", slug="settle-vs-reopen"
    )
    missing_tab = "00000000-0000-0000-0000-0000000000ff"

    settle = await client.post(
        f"/api/tabs/{missing_tab}/settle-externally",
        json={"informational_method": "card", "idempotency_key": "k" * 24},
        headers=_auth(token),
    )
    assert settle.status_code != 403, "bar_kitchen holds tabs.settle"

    reopen = await client.post(
        f"/api/tabs/{missing_tab}/reopen", json={}, headers=_auth(token)
    )
    assert reopen.status_code == 403
    assert reopen.json()["details"]["required_capability"] == "tabs.reopen"


# ─── 3. Escalation ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_manager_cannot_create_an_owner_or_a_peer(
    client: AsyncClient, db_session: AsyncSession
):
    _ctx, token = await _staff(
        db_session, role="manager", slug="escalation-manager"
    )
    for role in ["owner", "manager"]:
        response = await client.post(
            "/api/staff/invite",
            json={"email": f"new-{role}@example.com", "role": role},
            headers=_auth(token),
        )
        assert response.status_code == 403, (
            f"a manager invited a {role}: {response.text}"
        )

    # The three operational roles are exactly what a manager may hand out.
    for role in ["host_server", "bar_kitchen", "inventory_operator"]:
        response = await client.post(
            "/api/staff/invite",
            json={"email": f"new-{role}@example.com", "role": role},
            headers=_auth(token),
        )
        assert response.status_code in (200, 201), (
            f"a manager could not invite a {role}: {response.text}"
        )


@pytest.mark.asyncio
async def test_an_operational_role_cannot_reach_staff_management_at_all(
    client: AsyncClient, db_session: AsyncSession
):
    for role in ["host_server", "bar_kitchen", "inventory_operator"]:
        _ctx, token = await _staff(
            db_session, role=role, slug=f"no-staff-mgmt-{role}"
        )
        response = await client.post(
            "/api/staff/invite",
            json={"email": "sneaky@example.com", "role": "owner"},
            headers=_auth(token),
        )
        assert response.status_code == 403, f"{role} reached staff invitations"


def test_the_matrix_fails_closed_on_a_role_it_does_not_know():
    """A role the code has never heard of holds nothing.

    `ck_staff_role` normally makes this unreachable, which is why it is asserted
    at the function rather than over HTTP. It still has to hold: a sixth role
    added to the database ahead of the code, or a partially applied migration,
    must deny rather than fall through to a default.
    """
    assert capabilities_for("regional_director") == frozenset()
    assert capabilities_for(None) == frozenset()
    assert capabilities_for("") == frozenset()
    for capability in CAPABILITIES:
        assert not has_capability("regional_director", capability)


@pytest.mark.asyncio
async def test_a_demotion_takes_effect_for_an_already_open_session(
    client: AsyncClient, db_session: AsyncSession
):
    """A role change must not wait for the old token to expire.

    Stage 1 built `session_version` for exactly this. Without the bump, a
    demoted manager keeps manager reach for the life of their JWT, which would
    make the whole matrix advisory.
    """
    owner_ctx, owner_token = await _staff(
        db_session, role="owner", slug="demotion-owner"
    )
    manager_ctx, manager_token = await _staff(
        db_session, role="manager", slug="demotion-manager", business_id=owner_ctx.business_id
    )

    before = await client.get(
        f"/api/analytics/business/{owner_ctx.business_id}/kpis", headers=_auth(manager_token)
    )
    assert before.status_code == 200, before.text

    staff_row = await db_session.scalar(
        select(Staff).where(Staff.user_id == manager_ctx.user_id)
    )
    demote = await client.patch(
        f"/api/staff/{staff_row.id}",
        json={"role": "bar_kitchen"},
        headers=_auth(owner_token),
    )
    assert demote.status_code == 200, demote.text

    after = await client.get(
        f"/api/analytics/business/{owner_ctx.business_id}/kpis", headers=_auth(manager_token)
    )
    assert after.status_code == 401, (
        "the demoted manager's existing session survived the role change"
    )
    assert after.json()["code"] == "UNAUTHORIZED"
