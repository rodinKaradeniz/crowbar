"""The demo seed must produce credentials that the real login route accepts.

`LoginRequest.email` is an `EmailStr`, so a seeded address in a reserved
special-use TLD (`.invalid`, `.test`, `.example`, `.localhost`) is rejected with
422 before authentication is ever attempted — every demo account silently stops
being able to log in. That happened once and nothing caught it, because the seed
is SQL and no test read it.

These tests read the seed file directly rather than a copy of the addresses, so
they keep holding after the seed is edited.
"""

import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.auth import LoginRequest
from app.schemas.reservation import ReservationCreate

SEED_FILE = Path(__file__).resolve().parents[2] / "db" / "seeds" / "001_seed_volt_and_vine.sql"

_EMAIL_LITERAL = re.compile(r"'([^'@\s]+@[^'\s]+)'")


def _seed_sql() -> str:
    return SEED_FILE.read_text(encoding="utf-8")


def _staff_user_emails() -> list[str]:
    """Addresses on the seeded `users` rows — the ones a person logs in with."""
    sql = _seed_sql()
    start = sql.index("INSERT INTO users (id, email,")
    end = sql.index(";", start)
    return _EMAIL_LITERAL.findall(sql[start:end])


def test_seed_file_exists():
    assert SEED_FILE.is_file(), f"seed file missing at {SEED_FILE}"


def test_seed_defines_one_login_per_role():
    assert len(_staff_user_emails()) == 5


@pytest.mark.parametrize("email", _staff_user_emails())
def test_seeded_staff_address_passes_the_login_schema(email: str):
    assert LoginRequest(email=email, password="irrelevant").email == email


def test_every_address_in_the_seed_passes_the_login_schema():
    """Customer and venue addresses flow into reservation and profile schemas too."""
    for email in sorted(set(_EMAIL_LITERAL.findall(_seed_sql()))):
        LoginRequest(email=email, password="irrelevant")


def test_reserved_special_use_tld_would_be_caught():
    """Guards the guard: prove the assertion above can actually fail."""
    with pytest.raises(ValidationError):
        LoginRequest(email="owner@example.invalid", password="irrelevant")


def test_staff_reservation_accepts_a_guest_with_no_email():
    """The waitlist acceptance path passes `customer.email`, which may be null.

    It used to substitute `guest@example.invalid`, which raised here instead of
    degrading — a 500 for any guest anonymised through the CRM withdrawal path
    while holding a live waitlist entry.
    """
    from datetime import datetime, timezone
    from uuid import uuid4

    data = ReservationCreate(
        service_type_id=uuid4(),
        time=datetime.now(timezone.utc),
        name="Guest",
        phone="+12025550100",
        email=None,
        guests=2,
    )

    assert data.email is None
