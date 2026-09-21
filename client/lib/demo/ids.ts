/**
 * Ids for the things a visitor makes in the demo.
 *
 * DERIVED FROM THE OP'S POSITION IN THE LOG, never stored in it. The cookie
 * that holds the log has about 3 KB to work with, and a UUID is 36 bytes, so
 * an id that can be computed is an id worth not keeping. Replaying the same
 * log always produces the same ids, and a later op refers to an earlier one by
 * index rather than by id.
 *
 * `0d` in the third group marks an id the demo invented. Nothing in the
 * recording uses it, so the two can never be confused, and a screenshot of a
 * demo is recognisable as one.
 */

const DEMO_ID_KINDS = {
  reservation: "01",
  seating: "02",
  tab: "03",
  order: "04",
  line: "05",
  settlement: "06",
  session: "07",
  timeline: "08",
  movement: "09",
  customer: "0a",
} as const;

export type DemoIdKind = keyof typeof DEMO_ID_KINDS;

/** `sub` separates the several ids one op mints — an order's line items. */
export function demoId(kind: DemoIdKind, opIndex: number, sub = 0): string {
  const tail = `${String(opIndex).padStart(6, "0")}${String(sub).padStart(6, "0")}`;
  return `00000000-0000-0d${DEMO_ID_KINDS[kind]}-0000-${tail}`;
}
