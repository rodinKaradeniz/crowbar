import type { Business } from "@/types";

/** The venue's week, as the API and the `Business` type carry it. */
type OperatingHours = Business["operatingHours"];

/** What one line of an hours ledger says, once identical days are merged. */
export interface HoursRun {
  /** "Monday", or "Monday – Thursday" for a merged run. */
  label: string;
  /** "17:00 – 02:00", or "Closed". */
  value: string;
}

export const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** Monday-first, the week as the venue's own operating hours are keyed. */
export const ORDERED_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

/**
 * Consecutive days that keep the same hours, collapsed into one line.
 *
 * The demo venue opens 17:00 – 02:00 every day of the week, which the public
 * reservation page printed as seven identical rows: 223px of a 781px panel
 * spent saying one thing seven times, and a guest scanning for "when are they
 * open" had to read all seven to discover they never differ. A venue that
 * closes on Mondays still gets its own line, because that is the line carrying
 * information.
 *
 * ONLY CONSECUTIVE RUNS MERGE, AND THAT IS THE WHOLE CORRECTNESS ARGUMENT.
 * Monday and Wednesday sharing hours across a closed Tuesday are two separate
 * facts; printing them as "Monday – Wednesday" would state something about
 * Tuesday that is false. A day the venue has not configured at all breaks a run
 * for the same reason — absent is not the same as equal.
 */
export function collapseOperatingHours(hours: OperatingHours): HoursRun[] {
  const runs: HoursRun[] = [];
  let start: string | null = null;
  let previous: string | null = null;
  let value = "";

  const label = (day: string) => DAY_LABELS[day] ?? day;

  const flush = () => {
    if (start === null || previous === null) return;
    runs.push({
      label: start === previous ? label(start) : `${label(start)} – ${label(previous)}`,
      value,
    });
  };

  for (const day of ORDERED_DAYS) {
    if (!(day in hours)) {
      flush();
      start = null;
      previous = null;
      continue;
    }
    const entry = hours[day];
    const next =
      "closed" in entry && entry.closed
        ? "Closed"
        : "open" in entry
          ? `${entry.open} – ${entry.close}`
          : "";

    if (start !== null && next === value) {
      previous = day;
      continue;
    }
    flush();
    start = day;
    previous = day;
    value = next;
  }
  flush();

  return runs;
}
