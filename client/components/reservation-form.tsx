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
import { TermsAndConditionsDialog } from "@/components/terms-and-conditions-dialog";
import { CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvailabilitySlot, ServiceType } from "@/types";
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

interface ReservationFormProps {
  businessId: string;
  businessTimezone: string;
  businessMaxGuests: number;
  serviceTypes?: ServiceType[];
  preselectedServiceTypeId?: string;
  onSuccess?: () => void;
}

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
  const initialServiceTypeId =
    preselectedServiceTypeId ??
    (serviceTypes.length === 1 ? serviceTypes[0].id : "");
  const venueToday = calendarDateForSlot(
    new Date().toISOString(),
    businessTimezone,
  );
  const [step, setStep] = useState<
    "type" | "datetime" | "info" | "confirmation" | "success" | "waitlist" | "waitlist-success"
  >(preselectedServiceTypeId ? "datetime" : "type");
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
  const [marketingSmsOptIn, setMarketingSmsOptIn] = useState(false);
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
  };

  const handleTypeSelected = () => {
    if (serviceTypeId) setStep("datetime");
  };

  const handleDateTimeContinue = () => {
    if (date && selectedSlotIsAvailable && guests) setStep("info");
  };

  const handleInfoContinue = () => {
    if (firstName && lastName && phone && email) setStep("confirmation");
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
        marketingSmsOptIn,
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
        localStorage.setItem(`reservation-waitlist-${waitlistEntry.id}`, waitlistEntry.managementToken);
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

  if (step === "success") {
    return (
      <div className="flex flex-col gap-6 p-6 items-center text-center">
        <CheckCircle2 className="h-14 w-14 text-primary" />
        <div>
          <h2 className="type-t1 mb-2">Reservation Submitted!</h2>
          <p className="text-muted-foreground">
            You&apos;ll receive a confirmation email shortly.
          </p>
        </div>
        <Button onClick={() => window.location.reload()} className="w-full">
          Make Another Reservation
        </Button>
      </div>
    );
  }

  if (step === "waitlist-success") {
    return (
      <div className="flex flex-col items-center gap-6 p-6 text-center">
        <CheckCircle2 className="h-14 w-14 text-primary" />
        <div>
          <h2 className="type-t1">You&apos;re on the waitlist</h2>
          <p className="mt-2 text-muted-foreground">
            If a suitable table opens, we&apos;ll email you a 15-minute offer to confirm it.
          </p>
        </div>
        {waitlistManagementToken && <Button asChild variant="secondary" className="w-full"><a href={`/reserve/waitlist/manage/${encodeURIComponent(waitlistManagementToken)}`}>Manage or cancel request</a></Button>}
        <Button onClick={() => window.location.reload()} className="w-full">Make another request</Button>
      </div>
    );
  }

  if (step === "waitlist") {
    return (
      <form className="flex flex-col gap-6 p-6" onSubmit={(event) => { event.preventDefault(); void handleWaitlistSubmit(); }}>
        <FieldGroup>
          <div className="text-center">
            <h2 className="type-t1">Join the waitlist</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose your preferred time in {availabilityTimezone}. We only send an offer if a matching slot opens.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field><FieldLabel htmlFor="waitlist-first-name">First name</FieldLabel><Input id="waitlist-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></Field>
            <Field><FieldLabel htmlFor="waitlist-last-name">Last name</FieldLabel><Input id="waitlist-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required /></Field>
          </div>
          <Field><FieldLabel htmlFor="waitlist-phone">Phone number</FieldLabel><Input id="waitlist-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required /></Field>
          <Field><FieldLabel htmlFor="waitlist-email">Email</FieldLabel><Input id="waitlist-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field><FieldLabel htmlFor="waitlist-time">Preferred time</FieldLabel><Input id="waitlist-time" type="time" value={waitlistTime} onChange={(event) => setWaitlistTime(event.target.value)} required /></Field>
            <Field>
              <FieldLabel htmlFor="waitlist-flexibility">We can offer up to</FieldLabel>
              <Select value={waitlistFlexMinutes} onValueChange={setWaitlistFlexMinutes}>
                <SelectTrigger id="waitlist-flexibility"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="30">30 minutes later</SelectItem><SelectItem value="60">1 hour later</SelectItem><SelectItem value="90">90 minutes later</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          {submitError && <p className="rounded-md bg-destructive/15 p-3 text-sm text-destructive" role="alert">{submitError}</p>}
          <div className="flex gap-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep("datetime")} disabled={isSubmitting}>Back</Button>
            <Button type="submit" className="flex-1" disabled={!firstName || !lastName || !phone || !email || !waitlistTime || isSubmitting}>{isSubmitting ? "Joining…" : "Join waitlist"}</Button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  if (step === "confirmation") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="text-center">
          <h2 className="type-t1 mb-2">Review Your Reservation</h2>
          <p className="text-muted-foreground">
            Please confirm your details before submitting
          </p>
          <div className="border-t border-border mt-4 mx-auto max-w-36" />
        </div>
        <div className="space-y-3 border bg-card p-5">
          <div className="flex items-baseline gap-2.5 text-sm">
            <span className="text-muted-foreground shrink-0">Date &amp; Time</span>
            <span className="flex-1" aria-hidden />
            <span className="font-medium text-right">
              {selectedSlot && formatSlotDate(selectedSlot.startsAt, availabilityTimezone)} at{" "}
              <span className="font-mono tabular-nums">
                {selectedSlot && formatSlotTime(selectedSlot.startsAt, availabilityTimezone)}
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-2.5 text-sm">
            <span className="text-muted-foreground shrink-0">Guests</span>
            <span className="flex-1" aria-hidden />
            <span className="font-mono tabular-nums font-medium">{guests}</span>
          </div>
          {selectedServiceType && (
            <div className="flex items-baseline gap-2.5 text-sm">
              <span className="text-muted-foreground shrink-0">Booking Type</span>
              <span className="flex-1" aria-hidden />
              <span className="flex items-center gap-2 font-medium">
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block"
                  style={{ backgroundColor: selectedServiceType.color }}
                />
                {selectedServiceType.name}
              </span>
            </div>
          )}
          <div className="flex items-baseline gap-2.5 text-sm">
            <span className="text-muted-foreground shrink-0">Name</span>
            <span className="flex-1" aria-hidden />
            <span className="font-medium">{firstName} {lastName}</span>
          </div>
          <div className="flex items-baseline gap-2.5 text-sm">
            <span className="text-muted-foreground shrink-0">Phone</span>
            <span className="flex-1" aria-hidden />
            <span className="font-mono tabular-nums font-medium">{phone}</span>
          </div>
          <div className="flex items-baseline gap-2.5 text-sm">
            <span className="text-muted-foreground shrink-0">Email</span>
            <span className="flex-1" aria-hidden />
            <span className="font-medium break-all">{email}</span>
          </div>
          {note && (
            <div className="flex items-baseline gap-2.5 text-sm">
              <span className="text-muted-foreground shrink-0">Note</span>
              <span className="flex-1" aria-hidden />
              <span className="font-medium text-right">{note}</span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="terms"
            checked={termsAgreed}
            onCheckedChange={(checked) => setTermsAgreed(checked === true)}
          />
          <label htmlFor="terms" className="text-sm leading-none">
            I agree to the{" "}
            <TermsAndConditionsDialog>
              <button
                type="button"
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                terms and conditions
              </button>
            </TermsAndConditionsDialog>
          </label>
        </div>

        <div className="space-y-3 border bg-muted/30 p-4">
          <p className="text-sm font-medium">Stay in touch <span className="font-normal text-muted-foreground">(optional)</span></p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={marketingEmailOptIn} onCheckedChange={(checked) => setMarketingEmailOptIn(checked === true)} />
            <span>Send me occasional news and offers by email.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={marketingSmsOptIn} onCheckedChange={(checked) => setMarketingSmsOptIn(checked === true)} />
            <span>Send me occasional news and offers by SMS.</span>
          </label>
        </div>

        {submitError && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={() => setStep("info")}
            variant="secondary"
            className="flex-1"
            disabled={isSubmitting}
          >
            Back
          </Button>
          <Button
            onClick={handleSubmit}
            className="flex-1"
            disabled={!termsAgreed || isSubmitting}
          >
            {isSubmitting ? (
              "Submitting…"
            ) : (
              "Submit Reservation"
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "info") {
    return (
      <form
        className="flex flex-col gap-6 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          handleInfoContinue();
        }}
      >
        <FieldGroup>
          <div className="text-center mb-4">
            <h2 className="type-t1 mb-2">Your Information</h2>
            <p className="text-sm text-muted-foreground">
              Please provide your contact details
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
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

          <div className="flex gap-3">
            <Button type="button" onClick={() => setStep("datetime")} variant="secondary" className="flex-1">
              Back
            </Button>
            <Button type="submit" disabled={!firstName || !lastName || !phone || !email} className="flex-1">
              Continue
            </Button>
          </div>
        </FieldGroup>
      </form>
    );
  }

  if (step === "datetime") {
    return (
      <form
        className="flex flex-col gap-6 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          handleDateTimeContinue();
        }}
      >
        <FieldGroup>
          <div className="text-center mb-4">
            <h2 className="type-t1 mb-2">Select Date &amp; Time</h2>
            <p className="text-sm text-muted-foreground">
              Choose from live availability in {availabilityTimezone}
            </p>
          </div>

          <Field>
            <FieldLabel htmlFor="reservation-guests">Number of Guests</FieldLabel>
            <Select value={guests} onValueChange={handleGuestsSelected}>
              <SelectTrigger id="reservation-guests">
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

          <Field>
            <FieldLabel>Available Time Slots</FieldLabel>
            {!guests ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Select your party size to see available times.
              </p>
            ) : isLoadingAvailability ? (
              <div className="flex items-center justify-center gap-2 rounded-md border border-dashed p-5 text-sm text-muted-foreground" aria-live="polite">
                Checking availability…
              </div>
            ) : availabilityError ? (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive" role="alert">
                {availabilityError}
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm" aria-live="polite">
                <p className="text-muted-foreground">No times are available for this date.</p>
                <Button type="button" variant="secondary" size="filter" className="mt-3" onClick={() => { setSubmitError(null); setStep("waitlist"); }}>
                  Join the waitlist
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
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
                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                    {formatSlotTime(slot.startsAt, availabilityTimezone)}
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
              <div className="grid gap-2">
                {alternatives.map((slot) => (
                  <Button
                    key={slot.startsAt}
                    type="button"
                    variant="secondary"
                    onClick={() => chooseAlternative(slot)}
                    className="justify-start"
                  >
                    {formatSlotDate(slot.startsAt, availabilityTimezone)} at{" "}
                    {formatSlotTime(slot.startsAt, availabilityTimezone)}
                  </Button>
                ))}
              </div>
            </Field>
          )}

          {submitError && alternatives.length === 0 && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive" role="alert">
              {submitError}
            </div>
          )}

          <Button
            type="submit"
            disabled={!date || !selectedSlotIsAvailable || !guests || isLoadingAvailability}
            className="w-full"
          >
            Continue
          </Button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-6 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        handleTypeSelected();
      }}
    >
      <FieldGroup>
        <div className="text-center mb-4">
          <h2 className="type-t1 mb-2">Select Booking Type</h2>
          <p className="text-sm text-muted-foreground">
            Choose the type of reservation you&apos;d like to make
          </p>
        </div>

        {serviceTypes.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>No booking types available for this business.</p>
          </div>
        ) : serviceTypes.length === 1 ? (
          <div className="p-4 border bg-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: serviceTypes[0].color }} />
              <h3 className="font-medium">{serviceTypes[0].name}</h3>
            </div>
            {serviceTypes[0].description && (
              <p className="text-sm text-muted-foreground mb-2">
                {serviceTypes[0].description}
              </p>
            )}
          </div>
        ) : (
          <Field>
            <FieldLabel htmlFor="reservation-service-type">Booking Type</FieldLabel>
            <Select value={serviceTypeId} onValueChange={handleServiceSelected} required>
              <SelectTrigger id="reservation-service-type">
                <SelectValue placeholder="Select a booking type" />
              </SelectTrigger>
              <SelectContent>
                {serviceTypes.map((serviceType) => (
                  <SelectItem key={serviceType.id} value={serviceType.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: serviceType.color }} />
                      <span>{serviceType.name}</span>
                      <span className="text-muted-foreground text-xs">
                        (Capacity: {serviceType.capacity})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedServiceType?.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {selectedServiceType.description}
              </p>
            )}
          </Field>
        )}

        <Button type="submit" disabled={!serviceTypeId} className="w-full">
          Continue
        </Button>
      </FieldGroup>
    </form>
  );
}
