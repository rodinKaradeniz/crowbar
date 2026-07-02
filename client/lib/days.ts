// Canonical day-of-week enumeration for the frontend.
//
// Index convention: 0 = Monday … 6 = Sunday. This is the mirror of
// server/app/constants/days.py and uses the identical indices, which match
// Python's datetime.weekday(). This is the single source of truth for day
// ordering on the frontend — do not redefine day lists elsewhere.
//
// IMPORTANT: JavaScript's Date.getDay() returns 0 = Sunday. When you have a
// JS Date and need our index, convert with jsDayToIndex(). Values stored on the
// backend (e.g. happy_hour_windows.days_of_week) always use the indices below.

export interface DayOfWeek {
  index: number; // 0 = Monday … 6 = Sunday
  key: string; // lowercase key (used by operating_hours dict)
  label: string; // full display label
  short: string; // abbreviated label
}

export const DAYS_OF_WEEK: DayOfWeek[] = [
  { index: 0, key: "monday", label: "Monday", short: "Mon" },
  { index: 1, key: "tuesday", label: "Tuesday", short: "Tue" },
  { index: 2, key: "wednesday", label: "Wednesday", short: "Wed" },
  { index: 3, key: "thursday", label: "Thursday", short: "Thu" },
  { index: 4, key: "friday", label: "Friday", short: "Fri" },
  { index: 5, key: "saturday", label: "Saturday", short: "Sat" },
  { index: 6, key: "sunday", label: "Sunday", short: "Sun" },
];

// Convert a JS Date.getDay() value (0=Sunday..6=Saturday) to our
// Monday-first index (0=Monday..6=Sunday).
export function jsDayToIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}
