/**
 * Keeps a recorded evening looking like tonight.
 *
 * Fixtures are recorded on one service day and stay untouched on disk. At
 * response time every strict ISO date or date-time string is moved forward by
 * the whole number of service days between the recording and now; request
 * dates are moved back by the same amount before a fixture is looked up. This
 * is the ONLY place in the demo that does date arithmetic.
 *
 * Days are counted in the venue's own timezone, and a date-time is moved in
 * WALL-CLOCK time there, so a 20:00 booking stays at 20:00 across a DST change
 * rather than drifting an hour. The service day rolls over at 04:00 so that a
 * bar open 17:00–02:00 is one evening, not two.
 */

export const DEMO_TIMEZONE = "Europe/Berlin";
const ROLLOVER_HOUR = 4;
const DAY_MS = 86_400_000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const wallFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DEMO_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function wallClockAt(instantMs: number): WallClock {
  const parts = Object.fromEntries(
    wallFormatter.formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** The instant at which the venue's clock reads `wall`. */
function instantForWallClock(wall: WallClock): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // Two passes settle the offset on both sides of a DST change.
  let guess = asUtc;
  for (let i = 0; i < 2; i += 1) {
    const seen = wallClockAt(guess);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
    guess += asUtc - seenAsUtc;
  }
  return guess;
}

function dayNumber(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

/** The venue's service day for an instant, as a day number. */
export function serviceDayNumber(instantMs: number): number {
  const wall = wallClockAt(instantMs - ROLLOVER_HOUR * 3_600_000);
  return dayNumber(wall.year, wall.month, wall.day);
}

/** Whole service days from the recording to now. */
export function dayOffset(recordedAtIso: string, nowMs = Date.now()): number {
  return serviceDayNumber(nowMs) - serviceDayNumber(Date.parse(recordedAtIso));
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function formatDate(epochDay: number): string {
  const d = new Date(epochDay * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function offsetMinutes(suffix: string): number {
  if (suffix === "Z") return 0;
  const sign = suffix.startsWith("-") ? -1 : 1;
  return sign * (Number(suffix.slice(1, 3)) * 60 + Number(suffix.slice(4, 6)));
}

/** Moves one string by `days`, or returns it unchanged if it is not a date. */
export function shiftValue(value: string, days: number): string {
  if (days === 0) return value;

  const date = DATE_RE.exec(value);
  if (date) {
    return formatDate(dayNumber(+date[1], +date[2], +date[3]) + days);
  }

  const dt = DATETIME_RE.exec(value);
  if (!dt) return value;
  const [, y, mo, d, h, mi, s, fraction, suffix] = dt;
  const hasSeconds = s !== undefined;

  if (!suffix) {
    // A naive local time is already wall-clock: move the date only.
    const movedDate = formatDate(dayNumber(+y, +mo, +d) + days);
    return `${movedDate}T${h}:${mi}${hasSeconds ? `:${s}${fraction ?? ""}` : ""}`;
  }

  const original = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}${suffix}`);
  const wall = wallClockAt(original);
  const movedWall = new Date((dayNumber(wall.year, wall.month, wall.day) + days) * DAY_MS);
  const moved = instantForWallClock({
    ...wall,
    year: movedWall.getUTCFullYear(),
    month: movedWall.getUTCMonth() + 1,
    day: movedWall.getUTCDate(),
  });

  // Render in the string's own offset and precision, so only the value changes.
  const local = new Date(moved + offsetMinutes(suffix) * 60_000);
  const datePart = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  const timePart = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  const secondsPart = hasSeconds ? `:${pad(local.getUTCSeconds())}${fraction ?? ""}` : "";
  return `${datePart}T${timePart}${secondsPart}${suffix}`;
}

/** Moves every date string anywhere inside a JSON value. */
export function shiftJson<T>(value: T, days: number): T {
  if (days === 0) return value;
  if (typeof value === "string") return shiftValue(value, days) as T;
  if (Array.isArray(value)) return value.map((item) => shiftJson(item, days)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shiftJson(item, days)]),
    ) as T;
  }
  return value;
}
