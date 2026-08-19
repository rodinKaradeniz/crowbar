---
name: change-crowbar-money-and-tax
description: Rules for touching money or tax in Crowbar — currency precision and half-up quantization, the currency lock, effective-dated tax profile versions, inclusive vs exclusive pricing, immutable per-line snapshots, and the client formatting boundary. Use when changing pricing, order placement, tab totals, tax profiles, regional settings, reports over monetary values, or any schema column holding an amount.
---

# Change money and tax in Crowbar

Money here is **operational, non-fiscal**. Crowbar estimates and records; the
venue's separate compliant register is the payment and fiscal authority. Every
rule below exists so that a later configuration change can never rewrite what
already happened.

Read `server/app/services/tax_service.py` and
`server/db/migrations/037_regional_tax_configuration.sql` before editing. They
are the authority; this skill is how to work with them.

## When to use

- Order placement, pricing, happy hour, modifiers, tab totals
- Tax profiles, versions, or the assignment of a profile to an item
- Regional settings (country, currency, locale, timezone, tax label)
- A new schema column holding an amount, rate, or currency
- Reports or exports that sum monetary values

## When NOT to use

- Non-monetary changes that merely display an already-formatted string
- Payment, tender, receipt, or fiscal work — that is **out of scope for the
  MVP** entirely; see `write-crowbar-operational-copy` and `docs/PRODUCT.md`

## 1. Precision and rounding

- Amounts are `NUMERIC(18,4)` in PostgreSQL and `Decimal` in Python. **Never
  float.**
- The minor unit comes from the tenant's currency, not from a constant:
  `currency_quantum()` in `server/app/core/regional.py` uses Babel's
  `get_currency_precision`, capped at 4.
- Rounding is **half-up to that quantum**, per line, via
  `ROUND_HALF_UP` — see `tax_service.calculate_line_tax`. Do not round at the
  end of a sum, and do not introduce banker's rounding.
- Order totals are the sum of already-rounded lines, so a total always equals
  what the lines say.

## 2. The currency lock

A tenant's `currency_code` can change **only while no priced record exists** —
no menu item, library item, inventory-cost row, or order. `business_service`
raises `BusinessConfigurationError` otherwise:

> "Currency cannot be changed after priced catalogue, inventory, or order data
> exists"

Do not add a bypass, and do not "convert" historical amounts by editing the
field. Reinterpreting stored numbers under a new currency is a data corruption,
not a settings change. An established-tenant conversion needs an explicit
future migration and repricing workflow.

Regional changes are audited: `business_regional_audits` records the actor and
the complete before/after values for country, currency, locale, timezone, and
tax label.

## 3. Tax profiles are identity; versions are history

- `tax_profiles` — stable per-tenant identity keyed by
  `UNIQUE (business_id, code)`. Archived, never deleted, and archiving is
  refused while an active menu item or library item still references it.
- `tax_profile_versions` — **append-only** policy history: `name`, `rate`
  (0–100), `price_includes_tax`, `effective_from`, `note`, `created_by`, with
  `UNIQUE (tax_profile_id, effective_from)`.

Resolution is effective-dated: `resolve_profile_version(db, business_id,
profile_id, at)` picks the version in force at that instant and raises if the
profile is missing, inactive, or not yet effective. Changing a rate means
**appending a version**, never updating one — an in-place edit silently
rewrites the meaning of past orders.

Migration 037 gave every existing tenant an `UNSPECIFIED` / "review required"
profile at 0% rather than guessing. Preserve that honesty: an unclassified item
is visible as unclassified, not silently taxed.

## 4. Inclusive vs exclusive is per version, and both must work

`calculate_line_tax(entered_total, rate, price_includes_tax, currency_code)`
returns `(net, tax, gross)`:

- **Inclusive** (`price_includes_tax=True`): the entered price *is* gross;
  `net = gross / (1 + rate/100)` rounded half-up, and `tax = gross - net` so
  the parts always reconcile to the gross the guest saw.
- **Exclusive**: the entered price is net; `tax = net * rate/100` rounded
  half-up, and `gross = net + tax`.
- **Zero rate** short-circuits: net == gross, tax is an explicit zero at the
  currency quantum.

A single order may mix inclusive and exclusive profiles across lines. Do not
write code that assumes one policy for the whole order or the whole tenant.

## 5. Snapshots are immutable

At placement, after happy-hour and modifier pricing are resolved server-side,
each order line stores its own copy of the tax facts (migration 037):
`currency_code`, `tax_profile_id`, `tax_profile_version_id`,
`tax_profile_name`, `tax_profile_code`, `tax_rate`, `price_includes_tax`,
`subtotal_amount`, `tax_amount`, `total_amount`. The order stores
`currency_code`, `subtotal_amount`, `tax_amount`, `total_amount`.

Consequences you must preserve:

- **Never recompute a placed order's tax** from current configuration. Read the
  snapshot. A report that re-derives tax from today's profile is a bug.
- Never backfill or "correct" snapshot columns on historical rows.
- A new monetary concept needs its own snapshot columns if it can be
  reconfigured later.

## 6. Classification is a human decision

There is **no runtime classifier**. Crowbar does not infer food vs beverage,
alcohol vs soft, standard vs reduced from a name, category, or unit type. An
owner or manager explicitly assigns a profile to every newly priced menu or
library item; modifiers and happy-hour prices inherit the parent item's
profile. Ordinary staff may edit other item details but not tax assignment or
policy.

The seeded German 19% / 7% / exempt examples are **editable demo data**, not a
maintained legal catalogue. Do not hard-code a rate, a country's rules, or a
category→rate mapping anywhere in runtime code.

## 7. The client formatting boundary

The browser never calculates money. It formats what the server sent:

- `client/lib/money.ts` — `toMoney` / `toOptionalMoney` for parsing an API
  value, `formatMoney(value, currency, locale)` for display via
  `Intl.NumberFormat`. The `MVP_CURRENCY` / `MVP_LOCALE` constants are
  fallbacks only.
- Tenant currency, locale, timezone, and tax label come from
  `client/contexts/regional-context.tsx`. Do not hard-code `EUR`, `de-DE`, or
  `Europe/Berlin` in a reusable component; locale controls **formatting only**,
  while product copy stays English.
- A cart preview is an estimate for the guest. It is never authority — order
  placement recomputes everything from tenant-owned data.

## Verifying

```bash
cd server && venv/bin/python -m pytest
cd client && npm run lint && npm run test:run && npm run build
```

Relevant coverage to extend: `server/tests/unit/test_regional_tax.py`,
`server/tests/integration/test_regional_tax_routes.py`,
`server/tests/integration/test_order_authority.py`, and
`client/tests/unit/money-and-business-time.test.ts`. Migration-level
constraints (rate bounds, uniqueness, the archive-state check) are not covered
by the ORM-metadata fixture — use `./scripts/verify-fresh-db.sh`.

## Anti-patterns

- `float` anywhere near an amount.
- Rounding once at the end instead of per line.
- Updating a `tax_profile_versions` row instead of appending one.
- Recomputing tax for a placed order from current configuration.
- Assuming inclusive pricing (or one policy per order).
- Hard-coding 19/7, EUR, or a category→rate mapping in runtime code.
- Adding a currency-conversion path to work around the currency lock.
- Calling any of this "fiscal", "VAT return", "revenue", or "receipt". It is an
  operational estimate.

## Reference

`docs/ARCHITECTURE.md` (Regional configuration and operational tax;
Authoritative order placement), `docs/PRODUCT.md` (Ordering and inventory),
`docs/HISTORY.md` (2026-08-14 regional/tax decision and its consequences),
sibling skills `write-crowbar-operational-copy` and `guard-crowbar-tenancy`.
