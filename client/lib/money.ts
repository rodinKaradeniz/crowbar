export const MVP_CURRENCY = "EUR";
export const MVP_LOCALE = "de-DE";

export function toMoney(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function toOptionalMoney(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : toMoney(value);
}

export function formatMoney(
  value: number | string,
  currency = MVP_CURRENCY,
  locale = MVP_LOCALE,
): string {
  const amount = toMoney(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}
