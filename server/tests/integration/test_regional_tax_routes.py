from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.menu import Menu, MenuCategory, MenuItem
from app.models.staff import Staff
from app.models.user import User
from app.services.auth_service import create_access_token


@pytest.mark.asyncio
async def test_german_defaults_are_editable_and_tax_management_is_tenant_and_role_scoped(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict,
):
    profiles_response = await client.get("/api/tax-profiles", headers=auth_headers)
    assert profiles_response.status_code == 200
    profiles = profiles_response.json()
    assert {
        (profile["code"], profile["current_version"]["rate"])
        for profile in profiles
    } == {
        ("STANDARD", 19.0),
        ("REDUCED", 7.0),
        ("EXEMPT", 0.0),
        ("CUSTOM", 0.0),
    }

    business = await db_session.scalar(select(Business).where(Business.slug == "test-business"))
    business_id = business.id
    staff_user = User(
        email="regional-staff@example.com",
        name="Regional Staff",
        password_hash="unused",
        user_type="staff",
    )
    db_session.add(staff_user)
    await db_session.flush()
    staff_user_id = staff_user.id
    db_session.add(Staff(user_id=staff_user_id, business_id=business_id, role="host_server"))
    await db_session.commit()
    staff_headers = {
        "Authorization": f"Bearer {create_access_token(str(staff_user_id), 'staff')}"
    }
    forbidden = await client.post(
        "/api/tax-profiles",
        headers=staff_headers,
        json={"code": "STAFF", "name": "Staff rate", "rate": 5},
    )
    assert forbidden.status_code == 403

    menu_response = await client.post(
        f"/api/ordering/{business_id}/menus",
        headers=auth_headers,
        json={"name": "Tax authority"},
    )
    assert menu_response.status_code == 201, menu_response.text
    category_response = await client.post(
        f"/api/ordering/{business_id}/menus/{menu_response.json()['id']}/categories",
        headers=auth_headers,
        json={"name": "Explicit"},
    )
    assert category_response.status_code == 201, category_response.text
    category_id = category_response.json()["id"]
    missing_assignment = await client.post(
        f"/api/ordering/{business_id}/categories/{category_id}/items",
        headers=auth_headers,
        json={"name": "Unclassified", "price": 5},
    )
    assert missing_assignment.status_code == 422
    standard = next(profile for profile in profiles if profile["code"] == "STANDARD")
    reduced = next(profile for profile in profiles if profile["code"] == "REDUCED")
    created_item = await client.post(
        f"/api/ordering/{business_id}/categories/{category_id}/items",
        headers=auth_headers,
        json={"name": "Classified", "price": 5, "tax_profile_id": standard["id"]},
    )
    assert created_item.status_code == 201, created_item.text
    staff_create = await client.post(
        f"/api/ordering/{business_id}/categories/{category_id}/items",
        headers=staff_headers,
        json={"name": "Staff classification", "price": 5, "tax_profile_id": reduced["id"]},
    )
    assert staff_create.status_code == 403
    staff_edit = await client.patch(
        f"/api/ordering/{business_id}/items/{created_item.json()['id']}",
        headers=staff_headers,
        json={"name": "Staff may edit service copy"},
    )
    assert staff_edit.status_code == 200, staff_edit.text
    staff_tax_change = await client.patch(
        f"/api/ordering/{business_id}/items/{created_item.json()['id']}",
        headers=staff_headers,
        json={"tax_profile_id": reduced["id"]},
    )
    assert staff_tax_change.status_code == 403

    other_registration = await client.post(
        "/api/auth/register-business",
        json={
            "email": "other-regional@example.com",
            "password": "password1234",
            "name": "Other Owner",
            "phone": "+14155550101",
            "business_name": "Other Regional",
            "business_slug": "other-regional",
            "country_code": "US",
            "currency_code": "USD",
            "locale": "en-US",
            "timezone": "America/New_York",
            "tax_label": "Sales tax",
        },
    )
    assert other_registration.status_code == 201, other_registration.text
    other_headers = {
        "Authorization": f"Bearer {other_registration.json()['access_token']}"
    }
    cross_tenant_version = await client.post(
        f"/api/tax-profiles/{profiles[0]['id']}/versions",
        headers=other_headers,
        json={"name": "Foreign rewrite", "rate": 1},
    )
    assert cross_tenant_version.status_code == 422
    assert "not found" in cross_tenant_version.text.lower()


@pytest.mark.asyncio
async def test_region_changes_are_validated_audited_and_currency_locks_after_pricing(
    client: AsyncClient,
    db_session: AsyncSession,
    auth_headers: dict,
):
    current = await client.get("/api/businesses/current", headers=auth_headers)
    business_id = current.json()["id"]

    changed = await client.patch(
        f"/api/businesses/{business_id}",
        headers=auth_headers,
        json={
            "country_code": "US",
            "currency_code": "USD",
            "locale": "en-US",
            "timezone": "America/New_York",
            "tax_label": "Sales tax",
            "phone": "(415) 555-0100",
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["phone"] == "+14155550100"

    invalid = await client.patch(
        f"/api/businesses/{business_id}",
        headers=auth_headers,
        json={"locale": "definitely_not_a_locale", "timezone": "Europe/Berlin"},
    )
    assert invalid.status_code == 422
    unchanged = await client.get("/api/businesses/current", headers=auth_headers)
    assert unchanged.json()["locale"] == "en-US"
    assert unchanged.json()["timezone"] == "America/New_York"

    audit = await client.get(
        f"/api/businesses/{business_id}/regional-audit", headers=auth_headers
    )
    assert audit.status_code == 200
    assert len(audit.json()) == 1
    assert audit.json()[0]["previous_values"]["currency_code"] == "EUR"
    assert audit.json()[0]["new_values"]["currency_code"] == "USD"

    business = await db_session.get(Business, business_id)
    profiles = (await client.get("/api/tax-profiles", headers=auth_headers)).json()
    menu = Menu(business_id=business.id, name="Priced", is_active=True)
    db_session.add(menu)
    await db_session.flush()
    category = MenuCategory(
        menu_id=menu.id, business_id=business.id, name="Drinks", is_active=True
    )
    db_session.add(category)
    await db_session.flush()
    db_session.add(
        MenuItem(
            category_id=category.id,
            business_id=business.id,
            tax_profile_id=profiles[0]["id"],
            name="Priced item",
            price=Decimal("5.00"),
        )
    )
    await db_session.commit()

    locked = await client.patch(
        f"/api/businesses/{business_id}",
        headers=auth_headers,
        json={"currency_code": "EUR"},
    )
    assert locked.status_code == 422
    assert "cannot be changed" in locked.text.lower()
