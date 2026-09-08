"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, startOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { BookingPrivacyDisclosure } from "@/components/booking-privacy-disclosure";
import { BookingRail } from "@/components/reservation/booking-rail";
import { CalendarDays, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvailabilitySlot, ServiceType } from "@/types";
import { seriesVarForColor } from "@/lib/series-palette";
import { useRegionalSettings } from "@/contexts/regional-context";
import {
  ClientApiError,
  clientCreatePublicReservation,
  clientCreatePublicReservationWaitlist,
  clientGetAvailability,
} from "@/lib/client-api";
import { toast } from "sonner";
import {
  calendarDateForSlot,
  formatSlotDate,
  formatSlotTime,
  getAvailabilityAlternatives,
  venueLocalDateTimeToIso,
} from "@/lib/availability";

/**
 * The public booking flow, as a vertical stepper.
 *
 * IT WAS FOUR SCREENS INSIDE A 400px SIDE PANEL. The side panel has one
 * declared structure — header, figure band, definition list, history, footer
 * actions (docs/DESIGN.md §Components) — and a four-step form is not it. The
 * panel is gone; the steps run down a column of the page itself.
 *
 * AN ACCORDION WAS BUILT FIRST AND MEASURED OUT. Listing every step with the
 * current one expanded keeps each decision on screen and makes correcting one a
 * single click, which is the better shape. At 1280x800 the expanded steps
 * measured 911, 852 and 1003px against a 752px budget, and the collapsed rungs
 * cost 171px of it on every screen. `BookingRail` carries the same information
 * in 24px, and one step shows at a time.
 *
 * What survives from the accordion is the navigation: `Next` advances to the
 * first step that is still UNANSWERED, and the rail walks back to any step
 * already answered. So changing one slot from the review returns straight to
 * the review rather than marching forwards through details already given.
 *
 * The waitlist and the two outcome screens are not rungs — they replace the
 * stepper, because at that point there is nothing left to step through.
 */

interface ReservationFormProps {
  businessId: string;
  businessTimezone: string;
  businessMaxGuests: number;
  serviceTypes?: ServiceType[];
  preselectedServiceTypeId?: string;
  onSuccess?: () => void;
}

/** The rungs, in order. The branch screens are deliberately not in this list. */
const RUNGS = ["type", "datetime", "info", "confirmation"] as const;
type Rung = (typeof RUNGS)[number];

/**
 * Each rung's heading, in the same order. These strings are the surface's
 * accessible landmarks — they are what a screen reader announces on arriving at
 * a step and what `e2e/service-loop.spec.ts` waits for — so they are not
 * paraphrased casually.
 */
const RUNG_TITLES = [
  "Select Booking Type",
  "Select Date & Time",
  "Your Information",
  "Review Your Reservation",
] as const;

export function ReservationForm({
  businessId,
  businessTimezone,
  businessMaxGuests,
  serviceTypes: propServiceTypes,
  preselectedServiceTypeId,
  onSuccess,
}: ReservationFormProps) {
  const serviceTypes = useMemo(
    () => propServiceTypes ?? [],
    [propServiceTypes],
  );
  // The VENUE's locale, not the guest's browser. A German venue's booking said
  // "Mon, Sep 7, 2026 at 17:00" to a guest whose phone was set to English,
  // while the same booking's confirmation email and the staff board both use
  // the venue's own region — three formats for one reservation.
  const { locale } = useRegionalSettings();
  const slotDate = (value: string, timezone: string) =>
    formatSlotDate(value, timezone, locale);
  // The review states ONE date and has the room to spell its weekday out. The
  // slot grid and the staff surfaces keep the short form: they list many dates
  // at once, and a full weekday in each would wreck the column.
  const slotDateLong = (value: string, timezone: string) =>
    formatSlotDate(value, timezone, locale, { weekday: "long" });
  const slotTime = (value: string, timezone: string) =>
    formatSlotTime(value, timezone, locale);
  const initialServiceTypeId =
    preselectedServiceTypeId ??
    (serviceTypes.length === 1 ? serviceTypes[0].id : "");
  const venueToday = calendarDateForSlot(
    new Date().toISOString(),
    businessTimezone,
  );
  const [step, setStep] = useState<
    Rung | "success" | "waitlist" | "waitlist-success"
  >(initialServiceTypeId ? "datetime" : "type");
  const [date, setDate] = useState<Date | undefined>(venueToday);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [guests, setGuests] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [serviceTypeId, setServiceTypeId] = useState(initialServiceTypeId);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [alternatives, setAlternatives] = useState<AvailabilitySlot[]>([]);
  const [availabilityTimezone, setAvailabilityTimezone] =
    useState(businessTimezone);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [waitlistManagementToken, setWaitlistManagementToken] = useState<string | null>(null);
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [waitlistTime, setWaitlistTime] = useState("19:00");
  const [waitlistFlexMinutes, setWaitlistFlexMinutes] = useState("60");
  const submissionIdentity = useRef<{ fingerprint: string; key: string } | null>(null);

  const selectedServiceType = serviceTypeId
    ? serviceTypes.find((serviceType) => serviceType.id === serviceTypeId) ?? null
    : null;
  const maxPartySize = Math.max(
    0,
    Math.min(businessMaxGuests, selectedServiceType?.capacity ?? businessMaxGuests),
  );
  const selectedSlotIsAvailable = Boolean(
    selectedSlot &&
      availableSlots.some((slot) => slot.startsAt === selectedSlot.startsAt),
  );

  useEffect(() => {
    if (!serviceTypeId || !date || !guests) {
      setAvailableSlots([]);
      setAvailabilityError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoadingAvailability(true);
    setAvailabilityError(null);

    clientGetAvailability({
      businessId,
      serviceTypeId,
      startDate: format(date, "yyyy-MM-dd"),
      days: 1,
      guests: Number(guests),
      signal: controller.signal,
    })
      .then((availability) => {
        const slots = availability.dates[0]?.slots ?? [];
        setAvailableSlots(slots);
        setAvailabilityTimezone(availability.timezone);
        setSelectedSlot((current) =>
          current && slots.some((slot) => slot.startsAt === current.startsAt)
            ? current
            : null,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAvailableSlots([]);
        setSelectedSlot(null);
        setAvailabilityError(
          error instanceof Error
            ? error.message
            : "Availability could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingAvailability(false);
      });

    return () => controller.abort();
  }, [businessId, date, guests, serviceTypeId]);

  // What each rung has to produce before the one after it can be reached. Also
  // what decides whether a rung renders as answered rather than upcoming, so
  // there is exactly one definition of "done" rather than a second progress
  // counter that can disagree with the form's actual contents.
  const answered: Record<Rung, boolean> = {
    type: Boolean(serviceTypeId),
    datetime: Boolean(date && selectedSlotIsAvailable && guests),
    info: Boolean(firstName && lastName && phone && email),
    confirmation: false,
  };

  /**
   * Advance to the first rung after `from` that is still unanswered, or to the
   * review when they all are. A guest who reopens the time step from the review
   * to change one slot goes straight back to the review; they do not walk
   * forwards through details they already gave.
   */
  const advanceFrom = (from: Rung) => {
    const rest = RUNGS.slice(RUNGS.indexOf(from) + 1);
    setStep(rest.find((rung) => !answered[rung]) ?? "confirmation");
  };

  const handleDateSelected = (nextDate: Date | undefined) => {
    setDate(nextDate);
    setSelectedSlot(null);
    setAlternatives([]);
  };

  const handleGuestsSelected = (value: string) => {
    setGuests(value);
    setSelectedSlot(null);
    setAlternatives([]);
  };

  const handleServiceSelected = (value: string) => {
    setServiceTypeId(value);
    setGuests("");
    setSelectedSlot(null);
    setAlternatives([]);
    // Choosing a type SELECTS it and nothing more. It used to advance the rung
    // on the click, which made this the one step whose action was the answer
    // itself; the footer now carries the action on all four, in one place.
  };

  const handleDateTimeContinue = () => {
    if (date && selectedSlotIsAvailable && guests) advanceFrom("datetime");
  };

  const handleInfoContinue = () => {
    if (firstName && lastName && phone && email) advanceFrom("info");
  };

  const chooseAlternative = (slot: AvailabilitySlot) => {
    setDate(calendarDateForSlot(slot.startsAt, availabilityTimezone));
    setSelectedSlot(slot);
    setAlternatives([]);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (!selectedSlot) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const submission = {
        businessId,
        serviceTypeId,
        time: selectedSlot.startsAt,
        name: `${firstName} ${lastName}`,
        phone,
        email,
        guests: Number(guests),
        note: note || undefined,
        marketingEmailOptIn,
        /* No `marketingSmsOptIn`: the box is gone from this form, and
           `client-api.ts` already sends `marketing_sms_opt_in: false` for an
           absent field. The column, the schema and the staff CRM control are
           untouched — see docs/TODO.md. */
      };
      const fingerprint = JSON.stringify(submission);
      if (submissionIdentity.current?.fingerprint !== fingerprint) {
        submissionIdentity.current = {
          fingerprint,
          key: crypto.randomUUID(),
        };
      }
      await clientCreatePublicReservation({
        ...submission,
        idempotencyKey: submissionIdentity.current.key,
      });
      toast.success("Reservation submitted successfully!");
      setStep("success");
      onSuccess?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit reservation";
      if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
        setAlternatives(getAvailabilityAlternatives(error));
        setSelectedSlot(null);
        setStep("datetime");
      }
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWaitlistSubmit = async () => {
    if (!date || !serviceTypeId || !guests) return;
    const requestedStartsAt = venueLocalDateTimeToIso(
      date,
      waitlistTime,
      availabilityTimezone,
    );
    if (!requestedStartsAt) {
      setSubmitError("That time does not occur at the venue on this date. Please choose another time.");
      return;
    }
    const flexibleUntil = new Date(
      new Date(requestedStartsAt).getTime() + Number(waitlistFlexMinutes) * 60_000,
    ).toISOString();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const waitlistEntry = await clientCreatePublicReservationWaitlist({
        businessId,
        serviceTypeId,
        requestedStartsAt,
        flexibleUntil,
        guests: Number(guests),
        name: `${firstName} ${lastName}`.trim(),
        phone,
        email,
        idempotencyKey: crypto.randomUUID(),
      });
      if (waitlistEntry.managementToken) {
        // Held in memory only. It was also written to localStorage, which
        // nothing ever read back — a bearer credential parked on a device that
        // may not be the guest's own, for no benefit.
        setWaitlistManagementToken(waitlistEntry.managementToken);
      }
      setStep("waitlist-success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not join the waitlist";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Outcome screens ────────────────────────────────────────────────────────
  // No tick, no green check mark: docs/DESIGN.md — this system has no success-
  // tick pattern, and brand green never means "good news". The outcome is
  // carried by the heading and by what it tells the guest happens next.

  if (step === "success") {
    return (
      <Outcome
        eyebrow="Reservations"
        title="Reservation submitted"
        body="You'll receive a confirmation email shortly. The venue confirms the booking itself — check that email before you travel."
      >
        <Button onClick={() => window.location.reload()} className="w-full">
          Make Another Reservation
        </Button>
      </Outcome>
    );
  }

  if (step === "waitlist-success") {
    return (
      <Outcome
        eyebrow="Waitlist"
        title="You're on the waitlist"
        body="If a suitable table opens, we'll email you a 15-minute offer to confirm it."
      >
        {waitlistManagementToken && (
          <Button asChild variant="secondary" className="w-full">
            <a href={`/reserve/waitlist/manage#token=${encodeURIComponent(waitlistManagementToken)}`}>
              Manage or cancel request
            </a>
          </Button>
        )}
        <Button onClick={() => window.location.reload()} className="w-full">
          Make another request
        </Button>
      </Outcome>
    );
  }

  if (step === "waitlist") {
    return (
      <form
        className="flex flex-col gap-[var(--space-24)]"
        onSubmit={(event) => {
          event.preventDefault();
          void handleWaitlistSubmit();
        }}
      >
        <FormMasthead
          eyebrow="Waitlist"
          title="Join the waitlist"
          note={`Choose your preferred time in ${availabilityTimezone}. We only send an offer if a matching slot opens.`}
        />
        <FieldGroup>
          <div className="grid grid-cols-2 gap-[var(--space-16)]">
            <Field><FieldLabel htmlFor="waitlist-first-name">First name</FieldLabel><Input id="waitlist-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></Field>
            <Field><FieldLabel htmlFor="waitlist-last-name">Last name</FieldLabel><Input id="waitlist-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required /></Field>
          </div>
          <Field><FieldLabel htmlFor="waitlist-phone">Phone number</FieldLabel><Input id="waitlist-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></Field>
          <Field><FieldLabel htmlFor="waitlist-email">Email</FieldLabel><Input id="waitlist-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-[var(--space-16)]">
            <Field><FieldLabel htmlFor="waitlist-time">Preferred time</FieldLabel><Input id="waitlist-time" type="time" value={waitlistTime} onChange={(event) => setWaitlistTime(event.target.value)} required /></Field>
            <Field>
              <FieldLabel htmlFor="waitlist-flexibility">We can offer up to</FieldLabel>
              <Select value={waitlistFlexMinutes} onValueChange={setWaitlistFlexMinutes}>
                <SelectTrigger id="waitlist-flexibility"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="30">30 minutes later</SelectItem><SelectItem value="60">1 hour later</SelectItem><SelectItem value="90">90 minutes later</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          {submitError && <FormFault>{submitError}</FormFault>}
          <div className="flex gap-[var(--space-12)]">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep("datetime")} disabled={isSubmitting}>Back</Button>
            <Button type="submit" className="flex-1" disabled={!firstName || !lastName || !phone || !email || !waitlistTime || isSubmitting}>{isSubmitting ? "Joining…" : "Join waitlist"}</Button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  // ── The stepper ────────────────────────────────────────────────────────────

  // Everything above returned, so `step` is one of the four rungs from here
  // down — the waitlist and the outcome screens cannot reach the footer.
  const rungIndex = RUNGS.indexOf(step);
  // `answered` is the SAME record the rail reads, so "Next is enabled" and "the
  // rung renders as answered" cannot disagree. Only the review's pair and the
  // time step's in-flight check are stated here; neither is a field a rung
  // collects, so neither belongs in `answered`.
  const canAdvance =
    step === "confirmation"
      ? termsAgreed && !isSubmitting
      : step === "datetime"
        ? answered.datetime && !isLoadingAvailability
        : answered[step];
  // Rungs 2 and 3 are real forms, and Next is their SUBMIT button rather than a
  // second control beside one. That is what keeps Enter in a field and a click
  // on Next one path instead of two that can drift apart — and it is what keeps
  // Enter working at all: a form with five inputs and no submit button has no
  // implicit submission.
  const rungFormId =
    step === "datetime"
      ? "booking-datetime"
      : step === "info"
        ? "booking-info"
        : undefined;

  return (
    // `min-h-0` + `flex-1` all the way down to the step body: that chain is what
    // lets ONE scroll container inside the step absorb a step taller than the
    // box, instead of the box growing. Without `min-h-0` a flex item refuses to
    // shrink below its content and the overflow escapes to the page.
    <div className="flex min-h-0 flex-1 flex-col">
      <BookingRail
        steps={RUNG_TITLES.map((title, index) => ({
          title,
          answered: answered[RUNGS[index]],
        }))}
        currentIndex={RUNGS.indexOf(step)}
        onOpen={(index) => setStep(RUNGS[index])}
      />

      <div className="mt-[var(--space-24)] flex min-h-0 flex-1 flex-col">
        {/* ── 1 ───────────────────────────────────────────────────────────── */}
        <StepPanel
          rung="type"
          current={step}
          title="Select Booking Type"
        >
          {serviceTypes.length === 0 ? (
            // Honest, and not a failure state: a venue with no booking types
            // configured has nothing for this form to offer, and no amount of
            // retrying changes that.
            <p className="text-sm text-muted-foreground">
              No booking types are available right now. Contact the venue
              directly to book.
            </p>
          ) : (
            <div className="space-y-[var(--space-8)]">
              {serviceTypes.map((serviceType) => {
                const isSelected = serviceType.id === serviceTypeId;
                return (
                  <button
                    key={serviceType.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleServiceSelected(serviceType.id)}
                    className={cn(
                      // Selection is a 2px inset brand bar, the same device the
                      // data table uses — not a fill and not a second border.
                      "group w-full border border-l-2 p-[var(--space-16)] text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isSelected
                        ? "border-border border-l-primary bg-muted"
                        : "border-border border-l-border hover:border-l-primary",
                    )}
                  >
                    <span className="flex items-center gap-[var(--space-8)]">
                      {/*
                        The venue's colour for this type, resolved to a declared
                        slot. It used to paint `serviceType.color` raw — and the
                        demo tenant's orange sits close enough to `--attend-fill`
                        to read as an alarm beside a real one, which is the exact
                        failure the five-slot palette exists to prevent.
                      */}
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: seriesVarForColor(serviceType.color) }}
                        aria-hidden
                      />
                      <span className="type-t2">{serviceType.name}</span>
                    </span>
                    {serviceType.description && (
                      <span className="mt-[var(--space-4)] block text-sm leading-relaxed text-muted-foreground">
                        {serviceType.description}
                      </span>
                    )}
                    <span className="type-data mt-[var(--space-8)] flex items-center gap-[var(--space-16)] text-muted-foreground">
                      {serviceType.duration && (
                        <span className="flex items-center gap-[var(--space-4)]">
                          <Clock className="size-3" aria-hidden /> {serviceType.duration} min
                        </span>
                      )}
                      <span className="flex items-center gap-[var(--space-4)]">
                        <Users className="size-3" aria-hidden /> Up to {serviceType.capacity}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </StepPanel>

        {/* ── 2 ───────────────────────────────────────────────────────────── */}
        <StepPanel
          rung="datetime"
          current={step}
          title={"Select Date & Time"}
        >
          <form
            id="booking-datetime"
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              handleDateTimeContinue();
            }}
          >
            <FieldGroup>
              <p className="text-sm text-muted-foreground">
                Choose from live availability in {availabilityTimezone}
              </p>

              <div className="grid gap-[var(--space-16)] sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="reservation-guests">Number of Guests</FieldLabel>
                  <Select value={guests} onValueChange={handleGuestsSelected}>
                    <SelectTrigger id="reservation-guests" className="w-full">
                      <SelectValue placeholder="Select guests" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxPartySize }, (_, index) => index + 1).map((count) => (
                        <SelectItem key={count} value={count.toString()}>
                          {count} {count === 1 ? "guest" : "guests"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="reservation-date">Date</FieldLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="secondary"
                        type="button"
                        id="reservation-date"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !date && "text-muted-foreground",
                        )}
                      >
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={handleDateSelected}
                        disabled={(candidate) =>
                          startOfDay(candidate) < startOfDay(venueToday)
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
              </div>

              <Field>
                <FieldLabel>Available Time Slots</FieldLabel>
                {!guests ? (
                  <p className="border border-dashed border-border p-[var(--space-16)] text-sm text-muted-foreground">
                    Select your party size to see available times.
                  </p>
                ) : isLoadingAvailability ? (
                  <p
                    className="border border-dashed border-border p-[var(--space-16)] text-sm text-muted-foreground"
                    aria-live="polite"
                  >
                    Checking availability…
                  </p>
                ) : availabilityError ? (
                  <FormFault>{availabilityError}</FormFault>
                ) : availableSlots.length === 0 ? (
                  <div
                    className="border border-dashed border-border p-[var(--space-16)]"
                    aria-live="polite"
                  >
                    <p className="text-sm text-muted-foreground">
                      No times are available for this date.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="filter"
                      className="mt-[var(--space-12)]"
                      onClick={() => {
                        setSubmitError(null);
                        setStep("waitlist");
                      }}
                    >
                      Join the waitlist
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-[var(--space-8)]">
                    {availableSlots.map((slot) => (
                      <Button
                        key={slot.startsAt}
                        type="button"
                        variant={selectedSlot?.startsAt === slot.startsAt ? "primary" : "secondary"}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setAlternatives([]);
                          setSubmitError(null);
                        }}
                        className="w-full"
                      >
                        {slotTime(slot.startsAt, availabilityTimezone)}
                      </Button>
                    ))}
                  </div>
                )}
              </Field>

              {alternatives.length > 0 && (
                <Field>
                  <FieldLabel>Nearest Available Alternatives</FieldLabel>
                  <p className="text-sm text-muted-foreground">
                    Your previous time was just taken. Choose one of these live options.
                  </p>
                  <div className="grid gap-[var(--space-8)]">
                    {alternatives.map((slot) => (
                      <Button
                        key={slot.startsAt}
                        type="button"
                        variant="secondary"
                        onClick={() => chooseAlternative(slot)}
                        className="justify-start"
                      >
                        {slotDate(slot.startsAt, availabilityTimezone)}
                        {" · "}
                        {slotTime(slot.startsAt, availabilityTimezone)}
                      </Button>
                    ))}
                  </div>
                </Field>
              )}

              {submitError && alternatives.length === 0 && (
                <FormFault>{submitError}</FormFault>
              )}

            </FieldGroup>
          </form>
        </StepPanel>

        {/* ── 3 ───────────────────────────────────────────────────────────── */}
        <StepPanel
          rung="info"
          current={step}
          title="Your Information"
        >
          <form
            id="booking-info"
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              handleInfoContinue();
            }}
          >
            <FieldGroup>
              <div className="grid grid-cols-2 gap-[var(--space-16)]">
                <Field>
                  <FieldLabel htmlFor="reservation-first-name">First Name</FieldLabel>
                  <Input id="reservation-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="John" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="reservation-last-name">Last Name</FieldLabel>
                  <Input id="reservation-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Doe" required />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="reservation-phone">Phone Number</FieldLabel>
                <Input id="reservation-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 (555) 123-4567" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="reservation-email">Email</FieldLabel>
                <Input id="reservation-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="john@example.com" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="reservation-note">Note (optional)</FieldLabel>
                <Input id="reservation-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Any special requests or notes" />
              </Field>

            </FieldGroup>
          </form>
        </StepPanel>

        {/* ── 4 ───────────────────────────────────────────────────────────── */}
        <StepPanel
          rung="confirmation"
          current={step}
          title="Review Your Reservation"
        >
          <div className="flex flex-col gap-[var(--space-24)]">
            {/* The ledger: label left, the gap doing the work leader dots do on
                paper, the answer right. The same row rhythm as the hours in the
                venue panel and as the public menu. */}
            <dl className="divide-y divide-border border-y border-border">
              <ReviewRow label={"Date & Time"}>
                {/* "·", not "at": the date renders in the VENUE's locale, and
                    an English connector wedged inside a German date string is
                    two languages in one line. The middot is the separator the
                    rest of the system already uses. */}
                {selectedSlot && slotDateLong(selectedSlot.startsAt, availabilityTimezone)}
                {" · "}
                <span className="type-data">
                  {selectedSlot && slotTime(selectedSlot.startsAt, availabilityTimezone)}
                </span>
              </ReviewRow>
              <ReviewRow label="Guests">
                <span className="type-data">{guests}</span>
              </ReviewRow>
              {selectedServiceType && (
                <ReviewRow label="Booking Type">
                  <span className="inline-flex items-center gap-[var(--space-8)]">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: seriesVarForColor(selectedServiceType.color) }}
                      aria-hidden
                    />
                    {selectedServiceType.name}
                  </span>
                </ReviewRow>
              )}
              <ReviewRow label="Name">{firstName} {lastName}</ReviewRow>
              <ReviewRow label="Phone">
                <span className="type-data">{phone}</span>
              </ReviewRow>
              <ReviewRow label="Email">
                <span className="break-all">{email}</span>
              </ReviewRow>
              {note && <ReviewRow label="Note">{note}</ReviewRow>}
            </dl>

            {/* ONE GROUP, TWO BOXES, NO HEADING. The marketing box used to sit
                in a ruled "Stay in touch (optional)" group of its own, which
                spent a rule, a heading and the word "optional" on a single
                unchecked checkbox — and an unchecked box is already optional.
                The two decisions the guest makes here now sit together, and
                the asterisk carries the only distinction that matters: one is
                required to submit, the other is not. */}
            <div className="space-y-[var(--space-12)]">
              <div className="flex items-start gap-[var(--space-8)]">
                <Checkbox
                  id="terms"
                  /* The visible label now stops at "the", so the associated
                     name would read "I agree to the" to a screen reader. Say
                     the whole sentence here; the phrase itself is a separate
                     control. `required` is what the asterisk means, spelled
                     out for anyone who cannot see it. */
                  aria-label="I agree to the terms and conditions (required)"
                  aria-required
                  checked={termsAgreed}
                  onCheckedChange={(checked) => setTermsAgreed(checked === true)}
                />
                {/* Two elements, not one: the `<label>` stops before the phrase
                    so the dialog trigger is not inside it. Nested in a label,
                    clicking the link would also tick the box — agreeing on the
                    way to reading what is being agreed to. */}
                <p className="text-sm leading-none">
                  <label htmlFor="terms">I agree to the </label>
                  <BookingPrivacyDisclosure />
                  {/* Outside the trigger, so the underline covers the phrase
                      and not the mark. Hidden from the accessible name, which
                      says "required" in words instead. */}
                  <span aria-hidden>*</span>
                </p>
              </div>
              <label className="flex items-start gap-[var(--space-8)]">
                <Checkbox
                  checked={marketingEmailOptIn}
                  onCheckedChange={(checked) => setMarketingEmailOptIn(checked === true)}
                />
                {/* `leading-none` on both rows, so the two sit on the same
                    rhythm against their boxes. */}
                <span className="text-sm leading-none">
                  Send me occasional news and offers by email.
                </span>
              </label>
            </div>

            {submitError && <FormFault>{submitError}</FormFault>}
          </div>
        </StepPanel>

        {/* THE FOOTER IS A SIBLING OF THE STEP BODY, NOT A CHILD OF IT. The
            body is the scroller; this sits outside it, so the action is in the
            same place on all four rungs however tall the step is. It used to be
            the last thing inside each step, which put it at a different height
            on each one and below the fold on the tallest.

            Back is DISABLED on the first rung, not hidden: a control that
            appears and disappears moves the other one, and a footer that moves
            is the thing this replaced. */}
        <div className="mt-[var(--space-16)] flex shrink-0 gap-[var(--space-12)] border-t border-border pt-[var(--space-16)]">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={rungIndex === 0}
            onClick={() => setStep(RUNGS[rungIndex - 1])}
          >
            Back
          </Button>
          <Button
            type={rungFormId ? "submit" : "button"}
            form={rungFormId}
            className="flex-1"
            disabled={!canAdvance}
            onClick={
              rungFormId
                ? undefined
                : step === "confirmation"
                  ? handleSubmit
                  : () => advanceFrom("type")
            }
          >
            {step === "confirmation"
              ? isSubmitting
                ? "Submitting…"
                : "Submit Reservation"
              : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Small shared pieces ──────────────────────────────────────────────────────

/**
 * One step of the wizard: its heading, and its body when it is the step being
 * worked. A step that is not current renders nothing at all rather than being
 * hidden with CSS — an off-screen form whose fields are still focusable is a
 * tab order that walks through three steps the guest cannot see.
 */
function StepPanel({
  rung,
  current,
  title,
  children,
}: {
  rung: Rung;
  current: string;
  title: string;
  children: React.ReactNode;
}) {
  if (current !== rung) return null;
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <h2 className="type-t1">{title}</h2>
      {/* THE STEP BODY IS THE SCROLL CONTAINER, not the column and not the page.
          The title, the rail above it and the footer below it all stay put, so a
          guest correcting an answer finds the stepper and the action in the same
          place on every rung. Measurement decided this rather than the slot
          grid: the review is the tallest rung at every width — 488 at 1280, 501
          at 1024, against 373 / 395 for the tallest of the other three — so a
          scroller on the slots alone could never have held the box still. */}
      <div className="mt-[var(--space-16)] min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function FormMasthead({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div>
      <p className="type-label text-muted-foreground">{eyebrow}</p>
      <h2 className="type-t1 mt-[var(--space-8)]">{title}</h2>
      <p className="mt-[var(--space-8)] text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * A request that will not complete — critical, per docs/DESIGN.md's "a thing
 * that is broken right now". The declared tint and text tokens rather than a
 * translucent `destructive/15`, which is an opacity the token block never
 * declared, and always with the word, never colour alone.
 */
function FormFault({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="border border-border bg-critical-tint p-[var(--space-12)] text-sm text-critical-text"
    >
      {children}
    </div>
  );
}

function ReviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-[var(--space-12)] py-[var(--space-12)] text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <span className="flex-1" aria-hidden />
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function Outcome({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[var(--space-24)]" role="status">
      <div>
        <p className="type-label text-muted-foreground">{eyebrow}</p>
        <h2 className="type-t1 mt-[var(--space-8)]">{title}</h2>
        <div className="mt-[var(--space-16)] max-w-36 border-t border-border" />
        <p className="mt-[var(--space-16)] text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
      <div className="flex flex-col gap-[var(--space-12)]">{children}</div>
    </div>
  );
}
