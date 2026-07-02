"""
Phase A integration tests — customer_identity_service.upsert_customer.

Verifies the contract documented in §2.2 of the multi-channel plan:
  - Phone is the only unique key per business.
  - Phoneless calls return None (no row created).
  - Same phone within a business returns the existing row, optionally updating
    name/email when supplied.
  - Same phone across different businesses creates separate rows.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.customer import Customer
from app.services.customer_identity_service import upsert_customer


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def biz(db_session: AsyncSession) -> Business:
    b = Business(
        name="Test Biz",
        slug="test-biz",
        email="biz@example.com",
        phone="5550000000",
    )
    db_session.add(b)
    await db_session.flush()
    return b


@pytest_asyncio.fixture
async def biz_other(db_session: AsyncSession) -> Business:
    b = Business(
        name="Other Biz",
        slug="other-biz",
        email="other@example.com",
        phone="5550000001",
    )
    db_session.add(b)
    await db_session.flush()
    return b


# ─── upsert_customer ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_no_phone_returns_none_and_creates_no_row(
    db_session: AsyncSession, biz: Business
):
    result = await upsert_customer(
        db_session, biz.id, phone=None, email="x@example.com", name="X"
    )
    assert result is None

    rows = (await db_session.execute(select(Customer))).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_empty_phone_returns_none(db_session: AsyncSession, biz: Business):
    result = await upsert_customer(db_session, biz.id, phone="", email=None, name=None)
    assert result is None


@pytest.mark.asyncio
async def test_new_phone_inserts_row(db_session: AsyncSession, biz: Business):
    customer = await upsert_customer(
        db_session,
        biz.id,
        phone="+14155551111",
        email="alice@example.com",
        name="Alice",
    )
    assert customer is not None
    assert customer.phone == "+14155551111"
    assert customer.email == "alice@example.com"
    assert customer.name == "Alice"
    assert customer.business_id == biz.id


@pytest.mark.asyncio
async def test_same_phone_returns_existing_row(db_session: AsyncSession, biz: Business):
    first = await upsert_customer(
        db_session, biz.id, phone="+14155552222", email=None, name="Bob"
    )
    second = await upsert_customer(
        db_session, biz.id, phone="+14155552222", email=None, name=None
    )
    assert second.id == first.id


@pytest.mark.asyncio
async def test_existing_row_updates_name_and_email_when_supplied(
    db_session: AsyncSession, biz: Business
):
    await upsert_customer(db_session, biz.id, phone="+14155553333", email=None, name=None)
    updated = await upsert_customer(
        db_session,
        biz.id,
        phone="+14155553333",
        email="carol@example.com",
        name="Carol",
    )
    assert updated.email == "carol@example.com"
    assert updated.name == "Carol"


@pytest.mark.asyncio
async def test_existing_row_preserves_values_when_not_supplied(
    db_session: AsyncSession, biz: Business
):
    await upsert_customer(
        db_session,
        biz.id,
        phone="+14155554444",
        email="dave@example.com",
        name="Dave",
    )
    updated = await upsert_customer(
        db_session, biz.id, phone="+14155554444", email=None, name=None
    )
    assert updated.email == "dave@example.com"
    assert updated.name == "Dave"


@pytest.mark.asyncio
async def test_same_phone_different_businesses_creates_two_rows(
    db_session: AsyncSession, biz: Business, biz_other: Business
):
    a = await upsert_customer(
        db_session, biz.id, phone="+14155555555", email=None, name="Eve at A"
    )
    b = await upsert_customer(
        db_session, biz_other.id, phone="+14155555555", email=None, name="Eve at B"
    )
    assert a.id != b.id
    assert a.business_id == biz.id
    assert b.business_id == biz_other.id
