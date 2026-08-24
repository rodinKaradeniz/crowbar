"""
Phase 0 integration tests — tenant isolation and module guards.

Tests:
  1. Staff of business A cannot read reservations of business B.
  2. Staff of business A cannot update business B's profile.
  3. Staff of business A cannot list staff of business B.
  4. Staff of business A cannot list customers of business B.
  5. Staff of business A cannot read analytics of business B.
  6. A plain customer (no staff role) is forbidden from business-scoped routes.
  7. require_module returns 403 MODULE_DISABLED when a module is disabled.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auth_service import create_access_token, hash_password
from app.models.business import Business
from app.models.staff import Staff
from app.models.user import User


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _create_business_owner(
    db: AsyncSession,
    *,
    email: str,
    business_name: str,
    business_slug: str,
    enabled_modules: list[str] | None = None,
) -> tuple[User, Business, str]:
    """Create a user + business + owner staff entry. Returns (user, business, token)."""
    user = User(
        email=email,
        name=f"Owner of {business_name}",
        password_hash=hash_password("test-password-1234"),
        user_type="staff",
    )
    db.add(user)
    await db.flush()

    biz = Business(
        name=business_name,
        slug=business_slug,
        email=email,
        phone="5550000000",
        enabled_modules=enabled_modules or ["reservations", "queue", "ordering", "inventory", "insights"],
    )
    db.add(biz)
    await db.flush()

    assignment = Staff(user_id=user.id, business_id=biz.id, role="owner")
    db.add(assignment)
    await db.flush()
    await db.commit()

    token = create_access_token(str(user.id), "staff")
    return user, biz, token


# ─── 1. Cross-tenant reservation list ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_staff_cannot_read_other_business_reservations(
    client: AsyncClient, db_session: AsyncSession
):
    _, biz_a, token_a = await _create_business_owner(
        db_session, email="owner_a@example.com",
        business_name="Biz A", business_slug="biz-a",
    )
    _, biz_b, _ = await _create_business_owner(
        db_session, email="owner_b@example.com",
        business_name="Biz B", business_slug="biz-b",
    )

    # owner_a tries to list biz_b's reservations
    resp = await client.get(
        f"/api/reservations/business/{biz_b.id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["code"] == "FORBIDDEN"


# ─── 2. Cross-tenant business update ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_staff_cannot_update_other_business(
    client: AsyncClient, db_session: AsyncSession
):
    _, biz_a, token_a = await _create_business_owner(
        db_session, email="owner_a2@example.com",
        business_name="Biz A2", business_slug="biz-a2",
    )
    _, biz_b, _ = await _create_business_owner(
        db_session, email="owner_b2@example.com",
        business_name="Biz B2", business_slug="biz-b2",
    )

    resp = await client.patch(
        f"/api/businesses/{biz_b.id}",
        json={"name": "Hacked"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


# ─── 3. Cross-tenant staff list ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_staff_cannot_list_other_business_staff(
    client: AsyncClient, db_session: AsyncSession
):
    _, biz_a, token_a = await _create_business_owner(
        db_session, email="owner_a3@example.com",
        business_name="Biz A3", business_slug="biz-a3",
    )
    _, biz_b, _ = await _create_business_owner(
        db_session, email="owner_b3@example.com",
        business_name="Biz B3", business_slug="biz-b3",
    )

    resp = await client.get(
        f"/api/staff/business/{biz_b.id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


# ─── 4. Cross-tenant customer list ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_staff_cannot_list_other_business_customers(
    client: AsyncClient, db_session: AsyncSession
):
    _, biz_a, token_a = await _create_business_owner(
        db_session, email="owner_a4@example.com",
        business_name="Biz A4", business_slug="biz-a4",
    )
    _, biz_b, _ = await _create_business_owner(
        db_session, email="owner_b4@example.com",
        business_name="Biz B4", business_slug="biz-b4",
    )

    resp = await client.get(
        f"/api/customers/business/{biz_b.id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


# ─── 5. Cross-tenant analytics ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_staff_cannot_read_other_business_analytics(
    client: AsyncClient, db_session: AsyncSession
):
    _, biz_a, token_a = await _create_business_owner(
        db_session, email="owner_a5@example.com",
        business_name="Biz A5", business_slug="biz-a5",
    )
    _, biz_b, _ = await _create_business_owner(
        db_session, email="owner_b5@example.com",
        business_name="Biz B5", business_slug="biz-b5",
    )

    resp = await client.get(
        f"/api/analytics/business/{biz_b.id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


# ─── 6. Customer (no staff role) cannot access business routes ─────────────────

@pytest.mark.asyncio
async def test_customer_cannot_access_business_routes(
    client: AsyncClient, db_session: AsyncSession
):
    _, biz, _ = await _create_business_owner(
        db_session, email="biz_owner6@example.com",
        business_name="Biz 6", business_slug="biz-6",
    )

    # Legacy customer identities may still exist, but cannot self-register or
    # access staff-only routes.
    from app.models.user import User
    from app.services.auth_service import create_access_token, hash_password

    customer = User(
        email="customer6@example.com",
        password_hash=hash_password("password1234"),
        name="Customer",
        user_type="customer",
    )
    db_session.add(customer)
    await db_session.commit()
    token = create_access_token(
        str(customer.id), customer.user_type, customer.session_version
    )

    for path in [
        f"/api/reservations/business/{biz.id}",
        f"/api/staff/business/{biz.id}",
        f"/api/customers/business/{biz.id}",
        f"/api/analytics/business/{biz.id}",
    ]:
        resp = await client.get(path, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403, f"Expected 403 on {path}, got {resp.status_code}"
        assert resp.json()["code"] == "FORBIDDEN"


# ─── 7. require_module returns 403 MODULE_DISABLED ────────────────────────────

@pytest.mark.asyncio
async def test_module_disabled_returns_403(
    client: AsyncClient, db_session: AsyncSession
):
    """
    A business with only 'reservations' enabled should get MODULE_DISABLED
    when accessing a route guarded by require_module("ordering").

    We test this by directly calling a scaffolded ordering route once one exists.
    For now we verify the guard at the dependency level via a synthetic route
    registered only during this test.
    """
    from fastapi import Depends
    from app.dependencies import require_module
    from app.main import app as fastapi_app

    # Temporarily add a test-only route guarded by ordering module
    test_path = "/test_module_guard"

    @fastapi_app.get(test_path, include_in_schema=False)
    async def _guarded(_=Depends(require_module("ordering"))):
        return {"ok": True}

    # Create a business with ordering disabled
    _, biz, token = await _create_business_owner(
        db_session,
        email="biz_noorder@example.com",
        business_name="No Order Biz",
        business_slug="no-order-biz",
        enabled_modules=["reservations"],  # ordering NOT enabled
    )

    resp = await client.get(
        test_path,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    body = resp.json()
    assert body["code"] == "MODULE_DISABLED"
    assert body["details"]["module"] == "ordering"

    # Cleanup: remove the test route
    fastapi_app.routes[:] = [r for r in fastapi_app.routes if getattr(r, "path", None) != test_path]
