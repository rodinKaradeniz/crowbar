"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  clientCancelPublicReservation,
  clientExchangePublicCapability,
  clientGetAvailability,
  clientGetBusiness,
  clientGetPublicManagedReservation,
  clientReconfirmPublicReservation,
  clientReschedulePublicReservation,
} from "@/lib/client-api";
import { consumeCapabilityFragment } from "@/lib/capability-fragment";
import { reservationStatusSeverity } from "@/lib/severity";
import type { Availability, Business, Reservation } from "@/types";
import {
  formatBusinessDateTime,
  formatBusinessTime,
} from "@/lib/business-time";
import { DocumentLocale } from "@/components/document-locale";
import { GuestPrivacySection } from "./guest-privacy-section";

/**
 * The only page a guest sees after booking.
 *
 * Two things about its shape are deliberate.
 *
 * **The venue's name is the heading, not "Manage your booking".** A guest
 * arrives here from an email sent by a restaurant, not from a product they use.
 * Every other reworked guest surface leads with the venue for the same reason —
 * see `menu-client.tsx`.
 *
 * **The card is bounded to the viewport and the slot list is the only thing
 * inside it that scrolls.** How many times a venue offers is tenant data —
 * service hours divided by `slot_interval_minutes` — so a venue on 15-minute
 * intervals renders roughly double what the demo does. Tuning padding to fit
 * today's count would silently break the first time somebody changed that
 * setting. Everything else here is fixed height, so the slot list is the one
 * region that can absorb the variance.
 */

/** The eyebrow + hairline pair the other public surfaces use for a section. */
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <h2 className="type-label text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

/**
 * Slots come back correctly ordered and confusingly grouped.
 *
 * `_candidate_slots` walks one service date back on purpose, so an overnight
 * window contributes its early-morning hours to the requested date. Those hours
 * ARE bookable that night — but rendered as one flat run it puts `00:00` before
 * `17:00` and reads as though the venue opens at midnight. The sort is not the
 * problem, the silence is.
 *
 * The two runs are separated by a gap larger than one slot interval and by
 * nothing else, so that gap is what splits them. No threshold hour is invented,
 * and it does not depend on parsing a formatted time — which would have broken
 * the moment a venue ran a 12-hour locale.
 */
export function groupSlotRuns<T extends { startsAt: string }>(
  slots: readonly T[],
  slotIntervalMinutes: number,
): T[][] {
  const runs: T[][] = [];
  const maxGap = Math.max(slotIntervalMinutes, 1) * 60_000;
  for (const slot of slots) {
    const current = runs[runs.length - 1];
    const previous = current?.[current.length - 1];
    if (
      previous &&
      Date.parse(slot.startsAt) - Date.parse(previous.startsAt) <= maxGap
    ) {
      current.push(slot);
    } else {
      runs.push([slot]);
    }
  }
  return runs;
}

export default function ManageReservationClient() {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState(1);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = consumeCapabilityFragment();
    const exchange = token
      ? clientExchangePublicCapability("reservation", token)
      : Promise.resolve();
    void exchange
      .then(() => clientGetPublicManagedReservation())
      .then(async (value) => {
        setBusiness(await clientGetBusiness(value.businessId).catch(() => null));
        setReservation(value);
        setGuests(value.guests);
        setDate(value.time.slice(0, 10));
        // A load that succeeded clears whatever a previous attempt reported.
        // Without this a transient failure leaves a critical banner standing
        // over a page that is, visibly, working.
        setError(null);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "This reservation link is unavailable.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const timezone = business?.timezone ?? "UTC";
  const slots = useMemo(
    () => availability?.dates.flatMap((item) => item.slots) ?? [],
    [availability],
  );
  const runs = useMemo(
    () => groupSlotRuns(slots, availability?.slotIntervalMinutes ?? 30),
    [slots, availability?.slotIntervalMinutes],
  );

  async function loadAvailability() {
    if (!reservation || !date) return;
    setAction("slots");
    setError(null);
    try {
      setAvailability(
        await clientGetAvailability({
          businessId: reservation.businessId,
          serviceTypeId: reservation.serviceTypeId,
          startDate: date,
          days: 1,
          guests,
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load available times.",
      );
    } finally {
      setAction(null);
    }
  }

  async function run(kind: "cancel" | "reconfirm") {
    setAction(kind);
    setError(null);
    try {
      setReservation(
        kind === "cancel"
          ? await clientCancelPublicReservation()
          : await clientReconfirmPublicReservation(),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update reservation.",
      );
    } finally {
      setAction(null);
    }
  }

  async function reschedule(time: string) {
    if (!reservation) return;
    setAction(time);
    setError(null);
    try {
      setReservation(
        await clientReschedulePublicReservation({
          serviceTypeId: reservation.serviceTypeId,
          time,
          guests,
        }),
      );
      setAvailability(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That time is no longer available.",
      );
    } finally {
      setAction(null);
    }
  }

  if (loading) return <ManageSkeleton />;

  if (!reservation) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="type-d3">Reservation unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {error ?? "This link is invalid or has been replaced."}
          </p>
        </div>
      </main>
    );
  }

  const active =
    reservation.status === "pending" || reservation.status === "confirmed";
  // A venue that does not ask for reconfirmation refuses the call with a 409, so
  // offering the button there is offering an action that cannot succeed. `!==
  // false` rather than a truthy check: an older payload that omits the field
  // should keep the button, not silently lose it.
  const asksForReconfirmation = reservation.reconfirmationEnabled !== false;
  const guestLabel = (count: number) =>
    `${count} ${count === 1 ? "guest" : "guests"}`;

  return (
    <main className="grid min-h-dvh place-items-center p-[var(--space-24)]">
      {business?.locale ? <DocumentLocale locale={business.locale} /> : null}
      {/* The viewport cap belongs only where the two-column layout is designed
          to fit. Below 640 the card stacks, its content legitimately exceeds
          one screen, and capping it made the "Your data" footer overlap the
          reschedule column — the page must simply scroll there. */}
      <section className="flex w-full max-w-[var(--grid-workspace)] flex-col border border-border bg-card p-[var(--space-24)] phone:max-h-[calc(100dvh-var(--space-48))] phone:p-[var(--space-32)]">
        <header>
          <p className="type-label text-muted-foreground">
            Manage your booking
          </p>
          <h1 className="mt-2 type-d3">{business?.name ?? "Your reservation"}</h1>
        </header>

        {error && (
          <p
            role="alert"
            className="mt-[var(--space-16)] border-l-2 border-critical-fill bg-critical-tint p-3 text-[length:var(--ui-size)] text-critical-text"
          >
            {error}
          </p>
        )}

        <div className="mt-[var(--space-24)] grid min-h-0 flex-1 gap-[var(--space-32)] phone:grid-cols-2">
          {/* ── The booking ────────────────────────────────────────────── */}
          <div className="min-w-0">
            <SectionHeading>Your booking</SectionHeading>
            <p className="text-[length:var(--ui-size)]">
              {formatBusinessDateTime(
                reservation.time,
                timezone,
                business?.locale,
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {guestLabel(reservation.guests)}
            </p>
            <div className="mt-[var(--space-12)] flex flex-wrap items-center gap-[var(--space-8)]">
              <Badge tone={reservationStatusSeverity()}>
                {reservation.status.replace("_", " ")}
              </Badge>
              {reservation.cancelledLate && (
                <Badge tone={reservationStatusSeverity()}>
                  Late cancellation
                </Badge>
              )}
            </div>

            {/* Brand, not a green tick — this is "we have you", not a success
                state. */}
            {reservation.reconfirmedAt && (
              <p className="mt-[var(--space-12)] text-[length:var(--ui-size)] text-primary">
                You&apos;re reconfirmed.
              </p>
            )}

            {active && (
              <>
                <div className="mt-[var(--space-24)] flex flex-wrap gap-[var(--space-12)]">
                  {asksForReconfirmation && (
                    <Button
                      onClick={() => void run("reconfirm")}
                      disabled={action !== null}
                    >
                      <CheckCircle2 />{" "}
                      {action === "reconfirm" ? "Saving…" : "I’m still coming"}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => void run("cancel")}
                    disabled={action !== null}
                  >
                    <X />{" "}
                    {action === "cancel"
                      ? "Cancelling…"
                      : "Cancel reservation"}
                  </Button>
                </div>
                {/* Told before they act, not after. The same number the server
                    enforces decides `cancelledLate`. */}
                {reservation.cancellationWindowMinutes != null && (
                  <p className="mt-[var(--space-12)] text-xs text-muted-foreground">
                    {cancellationNotice(reservation.cancellationWindowMinutes)}
                  </p>
                )}
              </>
            )}
          </div>

          {/* ── Reschedule ─────────────────────────────────────────────── */}
          {active && (
            <div className="flex min-h-0 min-w-0 flex-col">
              <SectionHeading>Reschedule</SectionHeading>
              <div className="flex flex-wrap items-end gap-[var(--space-12)]">
                <div>
                  <label
                    htmlFor="reschedule-date"
                    className="type-label mb-1 block text-muted-foreground"
                  >
                    Date
                  </label>
                  <Input
                    id="reschedule-date"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="w-auto"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reschedule-guests"
                    className="type-label mb-1 block text-muted-foreground"
                  >
                    Guests
                  </label>
                  <Input
                    id="reschedule-guests"
                    type="number"
                    min={1}
                    max={business?.maxGuests}
                    value={guests}
                    onChange={(event) => {
                      // An emptied number input reads as "", which `Number`
                      // turns into 0 and the API rejects. Hold the last good
                      // value instead of sending a party of nobody.
                      const next = Number(event.target.value);
                      if (Number.isFinite(next) && next >= 1) setGuests(next);
                    }}
                    className="w-24"
                  />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => void loadAvailability()}
                  disabled={action !== null}
                >
                  <CalendarClock />{" "}
                  {action === "slots" ? "Loading…" : "Find times"}
                </Button>
              </div>

              {availability && (
                <div className="mt-[var(--space-16)] min-h-0 flex-1 overflow-y-auto">
                  {slots.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No times are available that day.
                    </p>
                  )}
                  {runs.map((run) => (
                    <SlotGroup
                      key={run[0].startsAt}
                      // One run needs no heading: there is nothing to tell
                      // apart. Two or more get their own span, which is the
                      // only thing that actually distinguishes them. Labelling
                      // by date does not: the small hours fall on the SAME
                      // calendar date as the evening they follow, so both runs
                      // came out reading "7. Sept. 2026" — worse than silence,
                      // because it says the two are the same thing.
                      label={
                        runs.length > 1
                          ? `${formatBusinessTime(
                              run[0].startsAt,
                              timezone,
                              business?.locale,
                            )} – ${formatBusinessTime(
                              run[run.length - 1].startsAt,
                              timezone,
                              business?.locale,
                            )}`
                          : null
                      }
                      slots={run}
                      timezone={timezone}
                      locale={business?.locale}
                      action={action}
                      onPick={reschedule}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cancelling clears the capability cookie AND bumps the token
            revision, so the guest's credential is dead the moment it returns.
            Precisely `cancelled`, not `!active`: a completed booking's link
            still works, and hiding the controls there would remove a right the
            guest still has. */}
        <GuestPrivacySection
          credentialRevoked={reservation.status === "cancelled"}
        />
      </section>
    </main>
  );
}

/** Both groups render identically; only the label and the set differ. */
function SlotGroup({
  label,
  slots,
  timezone,
  locale,
  action,
  onPick,
}: {
  label: string | null;
  slots: { startsAt: string }[];
  timezone: string;
  locale: string | undefined;
  action: string | null;
  onPick: (time: string) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div className="mb-[var(--space-16)] last:mb-0">
      {label && (
        <p className="type-label mb-2 text-muted-foreground">{label}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {slots.map((slot) => (
          <Button
            key={slot.startsAt}
            size="filter"
            variant="secondary"
            disabled={action !== null}
            onClick={() => onPick(slot.startsAt)}
          >
            {formatBusinessTime(slot.startsAt, timezone, locale)}
          </Button>
        ))}
      </div>
    </div>
  );
}

function cancellationNotice(minutes: number): string {
  if (minutes >= 120 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Cancelling within ${hours} hours of your booking is recorded as a late cancellation.`;
  }
  return `Cancelling within ${minutes} minutes of your booking is recorded as a late cancellation.`;
}

/** Mirrors the real card's rhythm — header, two columns, footer — so nothing
 *  reflows when the reservation lands. */
function ManageSkeleton() {
  return (
    <main className="grid min-h-dvh place-items-center p-[var(--space-24)]">
      <section
        aria-busy
        aria-label="Loading your reservation"
        className="w-full max-w-[var(--grid-workspace)] border border-border bg-card p-[var(--space-24)] phone:p-[var(--space-32)]"
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-8 w-64" index={1} />
        <div className="mt-[var(--space-24)] grid gap-[var(--space-32)] phone:grid-cols-2">
          <div>
            <Skeleton className="h-3 w-28" index={2} />
            <Skeleton className="mt-4 h-4 w-48" index={3} />
            <Skeleton className="mt-2 h-4 w-20" index={4} />
            <Skeleton className="mt-[var(--space-24)] h-[var(--control-desktop)] w-56" index={5} />
          </div>
          <div>
            <Skeleton className="h-3 w-24" index={6} />
            <Skeleton className="mt-4 h-[var(--control-desktop)] w-full" index={7} />
            <Skeleton className="mt-4 h-20 w-full" index={8} />
          </div>
        </div>
      </section>
    </main>
  );
}
