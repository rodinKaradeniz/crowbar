from decimal import Decimal

import pytest

from app.core.regional import (
    RegionalValidationError,
    currency_quantum,
    normalize_phone,
    suggested_region,
    validate_country_code,
    validate_currency_code,
    validate_locale,
    validate_timezone,
)
from app.services.tax_service import calculate_line_tax


def test_region_identifiers_are_canonical_and_country_suggestions_are_editable_values():
    assert validate_country_code(" de ") == "DE"
    assert validate_currency_code(" eur ") == "EUR"
    assert validate_locale("de_DE") == "de-DE"
    assert validate_timezone("Europe/Berlin") == "Europe/Berlin"
    assert suggested_region("DE") == {
        "country_code": "DE",
        "currency_code": "EUR",
        "locale": "de-DE",
        "tax_label": "VAT",
    }
    assert suggested_region("US")["currency_code"] == "USD"


@pytest.mark.parametrize(
    ("validator", "value"),
    [
        (validate_country_code, "ZZ"),
        (validate_currency_code, "NOT-MONEY"),
        (validate_locale, "not_a_locale"),
        (validate_timezone, "Europe/Nowhere"),
    ],
)
def test_invalid_region_identifiers_are_rejected(validator, value):
    with pytest.raises(RegionalValidationError):
        validator(value)


def test_phone_numbers_use_the_selected_country_and_store_e164():
    assert normalize_phone("030 901820", "DE") == "+4930901820"
    assert normalize_phone("(415) 555-0100", "US") == "+14155550100"
    with pytest.raises(RegionalValidationError):
        normalize_phone("1", "DE")


def test_line_tax_rounding_supports_inclusive_exclusive_and_zero_rate_profiles():
    assert calculate_line_tax(Decimal("11.90"), Decimal("19"), True, "EUR") == (
        Decimal("10.00"),
        Decimal("1.90"),
        Decimal("11.90"),
    )
    assert calculate_line_tax(Decimal("10.00"), Decimal("7"), False, "EUR") == (
        Decimal("10.00"),
        Decimal("0.70"),
        Decimal("10.70"),
    )
    assert calculate_line_tax(Decimal("10.125"), Decimal("0"), True, "KWD") == (
        Decimal("10.125"),
        Decimal("0.000"),
        Decimal("10.125"),
    )
    assert currency_quantum("JPY") == Decimal("1")
