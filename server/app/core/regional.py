from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import phonenumbers
from babel.core import Locale, UnknownLocaleError, get_global
from babel.numbers import get_currency_name, get_currency_precision, get_territory_currencies, list_currencies


class RegionalValidationError(ValueError):
    pass


def validate_country_code(value: str) -> str:
    code = value.strip().upper()
    if code not in phonenumbers.SUPPORTED_REGIONS:
        raise RegionalValidationError("Choose a valid ISO country code")
    return code


def validate_currency_code(value: str) -> str:
    code = value.strip().upper()
    if code not in list_currencies():
        raise RegionalValidationError("Choose a valid ISO currency code")
    return code


def validate_locale(value: str) -> str:
    candidate = value.strip().replace("_", "-")
    try:
        parsed = Locale.parse(candidate, sep="-")
    except (UnknownLocaleError, ValueError) as exc:
        raise RegionalValidationError("Choose a valid BCP 47 formatting locale") from exc
    # Babel's canonical form uses underscores; expose the web-standard hyphen form.
    return str(parsed).replace("_", "-")


def validate_timezone(value: str) -> str:
    candidate = value.strip()
    try:
        ZoneInfo(candidate)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise RegionalValidationError("Choose a valid IANA timezone") from exc
    return candidate


def validate_tax_label(value: str) -> str:
    label = value.strip()
    if not 1 <= len(label) <= 50:
        raise RegionalValidationError("Tax label must be between 1 and 50 characters")
    return label


def normalize_phone(value: str | None, country_code: str) -> str | None:
    if value is None or not value.strip():
        return None
    try:
        parsed = phonenumbers.parse(value.strip(), validate_country_code(country_code))
    except phonenumbers.NumberParseException as exc:
        raise RegionalValidationError("Enter a valid phone number for the selected country") from exc
    # Numbering plans change and pilot/demo numbers may be unallocated; reject
    # structurally impossible input while preserving valid international shape.
    if not phonenumbers.is_possible_number(parsed):
        raise RegionalValidationError("Enter a valid phone number for the selected country")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def currency_quantum(currency_code: str) -> Decimal:
    precision = min(get_currency_precision(validate_currency_code(currency_code)), 4)
    return Decimal(1).scaleb(-precision)


def regional_options(locale: str = "en") -> dict:
    display_locale = Locale.parse(validate_locale(locale), sep="-")
    countries = [
        {"code": code, "name": display_locale.territories.get(code, code)}
        for code in sorted(phonenumbers.SUPPORTED_REGIONS)
    ]
    countries.sort(key=lambda item: item["name"])
    currencies = [
        {"code": code, "name": get_currency_name(code, locale=display_locale)}
        for code in sorted(list_currencies())
    ]
    currencies.sort(key=lambda item: (item["name"], item["code"]))
    return {"countries": countries, "currencies": currencies}


def suggested_region(country_code: str) -> dict:
    code = validate_country_code(country_code)
    currencies = get_territory_currencies(code, tender=True)
    currency = currencies[0] if currencies else "EUR"
    language_data = get_global("territory_languages").get(code, {})
    official = [
        (language, details.get("population_percent", 0))
        for language, details in language_data.items()
        if details.get("official_status") in {"official", "de_facto_official"}
    ]
    language = max(official, key=lambda pair: pair[1])[0] if official else "en"
    return {
        "country_code": code,
        "currency_code": currency,
        "locale": validate_locale(f"{language}-{code}"),
        "tax_label": "VAT" if code in {"DE", "AT", "BE", "BG", "CY", "CZ", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"} else "Tax",
    }
