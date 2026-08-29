/**
 * The severity rank — a procedure, not a judgment call.
 *
 * `docs/DESIGN.md` is the authority. This module exists so that picking a tier
 * is a function call against real backend state rather than a per-component
 * decision, because the rank is the substance of the design: it decides what a
 * manager looks at first during service, and a misapplied tier makes the
 * product worse at its job than no colour at all.
 *
 * THE TEST, and nothing else picks the level:
 *
 *     What does a bartender do about it, and when?
 *
 *   critical  Act now, this shift. A time-critical service failure happening
 *             now. Exhaustively, per §08:
 *               · a ticket past its target time
 *               · a guest waiting past the time they were quoted
 *               · a live board that has lost its connection
 *               · a device that cannot send orders
 *             Plus, from the Auth canvas, the same idea on a non-service
 *             surface: a thing that is broken right now — a failed sign-in, a
 *             dead link, a request that will not complete.
 *
 *   attend    Before the night ends, not in the next two minutes: a party with
 *             no table assigned, a tab still open past close, an item that will
 *             run out during service, a ticket approaching target, a booking
 *             running late.
 *
 *   neutral   THE DEFAULT. Everything whose deadline is a day away: par levels,
 *             ordering, forecasts, variance, counts, comparisons. Reads through
 *             weight, position and the hairline badge, and gets no hue.
 *
 * DOES NOT QUALIFY AS CRITICAL: stock, money, next week, or a number being
 * lower than someone hoped. A busy night is not critical. Three reds on one
 * screen is already a lot; a fourth means the rank is being abused.
 *
 * DOES NOT QUALIFY AS ATTEND: par levels and ordering, ever.
 *
 * NOT ON THE LADDER AT ALL:
 *   · Form validation — a form state. `--field-invalid`, never a severity
 *     token. "Too short — 10 characters minimum" is this.
 *   · Brand — identity, the primary action, the active nav item, and
 *     live-and-healthy. Green never means "good news about a number".
 *
 * And the rule that constrains layout rather than colour:
 *
 *     SEVERITY DESCRIBES THE ITEM, NEVER THE CONTROL THAT RESOLVES IT.
 *
 * A late ticket gets a red rail, a red badge and a red timer — and a standard
 * primary "Served".
 */

export type Severity = "critical" | "attend" | "neutral"

/** Rank order, so a list can sort worst-first and a badge can carry the worst
 *  severity inside a collection. Attend never sits above a critical item. */
const RANK: Record<Severity, number> = {
  critical: 2,
  attend: 1,
  neutral: 0,
}

/** The worst severity in a collection — what a nav or summary badge fills to. */
export function worstSeverity(items: readonly Severity[]): Severity {
  return items.reduce<Severity>(
    (worst, item) => (RANK[item] > RANK[worst] ? item : worst),
    "neutral"
  )
}

/** Sort comparator: critical first, then attend, then neutral. */
export function bySeverity(a: Severity, b: Severity): number {
  return RANK[b] - RANK[a]
}

export function isMoreSevere(a: Severity, b: Severity): boolean {
  return RANK[a] > RANK[b]
}

/* ══════════════════════════════════════════════════════════════════════════
 * Derivations from real backend state.
 *
 * Each function below is deliberately narrow. If the backend cannot currently
 * supply what a rule needs, the function says so and returns "neutral" rather
 * than approximating — `docs/TODO.md` carries the gap. An approximated red is
 * a lie about the night.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * A live board that has lost its connection. One of the four exhaustive
 * critical cases, and — until ticket targets and queue quotes exist — the only
 * one this codebase can actually derive.
 *
 * Note this is an UPGRADE over the current behaviour: the ticket board and tabs
 * render disconnection in amber today, which understates it. A board that
 * quietly stops updating is worse than no board.
 */
export function connectionSeverity(connected: boolean): Severity {
  return connected ? "neutral" : "critical"
}

/**
 * A request or action that is broken right now — a failed load with a retry, a
 * dead invitation link, a failed sign-in. The Auth canvas is explicit that red
 * here means "a thing that is broken now".
 *
 * A *pending* or *retrying* state is not broken yet, and is neutral.
 */
export function failureSeverity(failed: boolean): Severity {
  return failed ? "critical" : "neutral"
}

/**
 * A tab still open past the close of the service day. Attend: it has to be
 * resolved before the night ends, but it is not a two-minute emergency.
 *
 * `serviceDayEnded` must come from the business's own service-day cutoff, not
 * the browser's midnight — see `lib/business-time.ts`.
 */
export function openTabSeverity(
  status: string,
  serviceDayEnded: boolean
): Severity {
  return status === "open" && serviceDayEnded ? "attend" : "neutral"
}

/**
 * A party with no table assigned. Attend — the design's Dashboard canvas shows
 * exactly this ("Bell ×6 · No table") as an attend row.
 */
export function unassignedPartySeverity(hasTable: boolean): Severity {
  return hasTable ? "neutral" : "attend"
}

/**
 * A booking running late. Attend, per §08's list.
 */
export function bookingLateSeverity(minutesLate: number | null): Severity {
  return minutesLate !== null && minutesLate > 0 ? "attend" : "neutral"
}

/**
 * A guest notification (queue "your table is ready") that failed to send.
 *
 * Attend rather than critical: the guest is waiting and will not be told, so it
 * must be handled before the night ends — but it is not one of §08's four
 * critical cases, and the default when a state does not clearly qualify is the
 * lower tier, not the higher one.
 */
export function deliverySeverity(state: string | undefined): Severity {
  return state === "failed" ? "attend" : "neutral"
}

/* ── Deliberately NOT derived ──────────────────────────────────────────────
 *
 * These are two of the four exhaustive critical cases. Both are unavailable,
 * and both are recorded in docs/TODO.md rather than approximated. Until they
 * land, critical legitimately appears on very few surfaces — which is the
 * correct honest outcome, not a bug in the port.
 */

/**
 * A ticket past its target time — critical — or approaching it — attend.
 *
 * NOT DERIVABLE. `Order` carries `placedAt` and a `statusTimeline`, so ticket
 * AGE is computable, but nothing in the schema configures a target: there is no
 * field on `PreparationStation` and no business setting. Age therefore renders
 * as a neutral figure, and the ageing rank cannot be applied.
 *
 * Comparing age against a hard-coded number here would invent the venue's
 * service standard, which is precisely the "magic value" Rule Zero forbids.
 */
export function ticketAgeSeverity(): Severity {
  return "neutral"
}

/**
 * A guest waiting past the time they were quoted — critical.
 *
 * NOT DERIVABLE. `queue_service.measured_wait_estimate` is a live, BOARD-LEVEL
 * median from tonight's real turn times; `QueueEntry` stores no quote-at-join.
 * Comparing a party's wait against the board's *current* estimate is a
 * different claim than "past the time they were quoted" — the quote may have
 * moved since they joined (the Tablet canvas shows exactly that: "it moved from
 * 20 to 25 minutes at 20:50") — so it is not done.
 */
export function queueWaitSeverity(): Severity {
  return "neutral"
}

/* ── Explicitly neutral, against the codebase's current instincts ──────────
 *
 * These exist as named functions so a screen port has something to point at
 * when it removes a colour, and so the reasoning is not re-litigated per file.
 */

/** Stock below par. §08 names par levels neutral twice; the States canvas puts
 *  "Campari below par · order by Tuesday" at the bottom of the list in no
 *  colour at all. It is next week's problem, on the same night. */
export function belowParSeverity(): Severity {
  return "neutral"
}

/** A count variance. Money-shaped and a day away — neutral. */
export function varianceSeverity(): Severity {
  return "neutral"
}

/** A figure that moved down. "A number being lower than someone hoped" is the
 *  named non-qualifying case; a month-over-month decline is neutral. */
export function trendSeverity(): Severity {
  return "neutral"
}

/** Table state — free, seated, reserved, cleaning, out of service. Workflow
 *  position, not severity. Seated tables carry a brand bar, not a hue. */
export function tableStateSeverity(): Severity {
  return "neutral"
}

/** Order workflow position — received, preparing, ready, served. Not severity. */
export function orderStatusSeverity(): Severity {
  return "neutral"
}
