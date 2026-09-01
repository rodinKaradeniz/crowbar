export function formatBusinessTime(value: string | number | Date, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatBusinessDate(value: string | Date, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatBusinessDateTime(value: string | Date, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * "Fr, 28. Aug" — the service day as the header and the boards name it.
 *
 * Weekday and no year: during service nobody needs telling what year it is, and
 * the weekday is what a roster is argued about in. Locale-driven like the rest
 * of this module — the German rendering the canvases show is *output*.
 */
export function formatBusinessServiceDay(
  value: string | number | Date,
  timeZone: string,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

/**
 * The same service day, spelled out.
 *
 * A SEPARATE FUNCTION, not an option on the one above, because the abbreviated
 * form is load-bearing where it is used: the overview's seven-night forecast
 * splits it on the comma to get a weekday for a narrow axis column, and the
 * reservation table sets it in a fixed-width mono cell. "Dienstag" would break
 * both. Use this only where a full line has room for it.
 */
export function formatBusinessServiceDayLong(
  value: string | number | Date,
  timeZone: string,
  locale?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(value));
}
