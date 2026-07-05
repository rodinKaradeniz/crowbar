// Canonical coercion for backend `Decimal`-typed fields.
//
// Money and other `Decimal` columns (prices, totals, price deltas, inventory
// quantities, costs) are declared as `number` in our TS types, but Pydantic can
// serialize a `Decimal` as a JSON *string*. The backend now normalizes these to
// bare JSON numbers globally (see server `AppBaseModel`), so in normal operation
// a `number` already arrives. These helpers are defense-in-depth: one place that
// guarantees a real `number` for any money-typed field, so mappers don't each
// scatter their own `Number(...)` calls (that inconsistency was the root cause of
// the earlier `toFixed` crash — some mappers coerced, others cast a string with
// `as number`). Use them in every mapper that reads a `Decimal`-origin field.

/** Coerce a required money/Decimal value to a number. Non-numeric → 0. */
export function toMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Coerce a nullable money/Decimal value. `null`/`undefined` stay `undefined`;
 * anything non-numeric also becomes `undefined` (never a silent `NaN`).
 */
export function toOptionalMoney(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}
