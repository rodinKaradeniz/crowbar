"""Tenant, role and module boundaries on every Stage 5 route.

Crowbar has no row-level security, so a missing business predicate is a silent
cross-tenant leak. These tests hit the HTTP surface rather than the services,
because that is where the guards actually live.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auth_service import create_access_token, hash_password
from app.models.business import Business
from app.models.staff import Staff
from app.models.user import User


async def _owner(
    db: AsyncSession,
    *,
    email: str,
    name: str,
    slug: str,
    enabled_modules: list[str] | None = None,
    role: str = "owner",
) -> tuple[str, str]:
    """Returns (business_id, token). The id is read before the commit that
    expires the ORM object, so callers never trigger a lazy reload."""
    user = User(
        email=email,
        name=f"Staff of {name}",
        password_hash=hash_password("test-password-1234"),
        user_type="staff",
    )
    db.add(user)
    await db.flush()
    business = Business(
        name=name,
        slug=slug,
        email=email,
        phone="5550000000",
        enabled_modules=enabled_modules or ["ordering", "inventory"],
        currency_code="EUR",
    )
    db.add(business)
    await db.flush()
    db.add(Staff(user_id=user.id, business_id=business.id, role=role))
    await db.flush()
    business_id = str(business.id)
    user_id = str(user.id)
    await db.commit()
    return business_id, create_access_token(user_id, "staff")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_stage5_routes_refuse_another_businesss_id(
    client: AsyncClient, db_session: AsyncSession
):
    _, token_a = await _owner(db_session, email="a@example.com", name="A", slug="iso-a")
    biz_b_id, _ = await _owner(db_session, email="b@example.com", name="B", slug="iso-b")

    reads = [
        f"/api/purchasing/{biz_b_id}/suppliers",
        f"/api/purchasing/{biz_b_id}/supplier-products",
        f"/api/purchasing/{biz_b_id}/purchase-orders",
        f"/api/inventory/{biz_b_id}/counts",
        f"/api/inventory/{biz_b_id}/cost-control",
        f"/api/inventory/{biz_b_id}/cost-control/margins",
    ]
    for path in reads:
        response = await client.get(path, headers=_auth(token_a))
        assert response.status_code == 403, f"{path} leaked to another tenant"

    writes = [
        (f"/api/purchasing/{biz_b_id}/suppliers", {"name": "Sneaky"}),
        (f"/api/inventory/{biz_b_id}/counts", {"kind": "stocktake"}),
    ]
    for path, body in writes:
        response = await client.post(path, json=body, headers=_auth(token_a))
        assert response.status_code == 403, f"{path} accepted a cross-tenant write"


@pytest.mark.asyncio
async def test_stage5_routes_require_the_inventory_module(
    client: AsyncClient, db_session: AsyncSession
):
    business_id, token = await _owner(
        db_session,
        email="nomodule@example.com",
        name="No Module",
        slug="iso-nomodule",
        enabled_modules=["reservations"],
    )
    for path in (
        f"/api/purchasing/{business_id}/suppliers",
        f"/api/purchasing/{business_id}/purchase-orders",
        f"/api/inventory/{business_id}/counts",
        f"/api/inventory/{business_id}/cost-control",
    ):
        response = await client.get(path, headers=_auth(token))
        assert response.status_code == 403
        assert response.json()["code"] == "MODULE_DISABLED"


@pytest.mark.asyncio
async def test_bar_staff_cannot_buy_reconcile_or_read_costs(
    client: AsyncClient, db_session: AsyncSession
):
    business_id, token = await _owner(
        db_session,
        email="server@example.com",
        name="Server Role",
        slug="iso-server",
        role="bar_kitchen",
    )
    forbidden_writes = [
        (f"/api/purchasing/{business_id}/suppliers", {"name": "Wholesaler"}),
        (f"/api/inventory/{business_id}/counts", {"kind": "stocktake"}),
    ]
    for path, body in forbidden_writes:
        response = await client.post(path, json=body, headers=_auth(token))
        assert response.status_code == 403, f"{path} allowed an ordinary staff write"

    # Cost and margin figures are manager information.
    response = await client.get(
        f"/api/inventory/{business_id}/cost-control", headers=_auth(token)
    )
    assert response.status_code == 403

    # But walking a count is exactly what a bartender does, so reading the
    # session list stays open to them.
    response = await client.get(f"/api/inventory/{business_id}/counts", headers=_auth(token))
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_transfer_routes_no_longer_exist(client: AsyncClient, db_session: AsyncSession):
    """Transfers were cut in Stage 5; nothing should answer on their paths."""
    business_id, token = await _owner(
        db_session, email="transfer@example.com", name="Transfers", slug="iso-transfer"
    )
    stub = "00000000-0000-0000-0000-000000000001"
    for path in (
        f"/api/inventory/{business_id}/transfers/{stub}/dispatch",
        f"/api/inventory/{business_id}/transfers/{stub}/receive",
    ):
        response = await client.post(path, json=[], headers=_auth(token))
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_receipt_idempotency_key_must_be_long_enough(
    client: AsyncClient, db_session: AsyncSession
):
    business_id, token = await _owner(
        db_session, email="key@example.com", name="Keys", slug="iso-keys"
    )
    stub = "00000000-0000-0000-0000-000000000001"
    response = await client.post(
        f"/api/purchasing/{business_id}/purchase-orders/{stub}/receipts",
        json={"idempotency_key": "short", "lines": []},
        headers=_auth(token),
    )
    assert response.status_code == 422
