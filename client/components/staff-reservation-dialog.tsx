"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CalendarClock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  calendarDateForSlot,
  formatSlotDate,
  formatSlotTime,
  formatSlotTimeWithZone,
  getAvailabilityAlternatives,
} from "@/lib/availability";
import {
  ClientApiError,
  clientCreateStaffReservation,
  clientGetReservationRescheduleAvailability,
  clientGetStaffOverrideTimes,
  clientGetStaffReservationAvailability,
  clientRescheduleReservation,
} from "@/lib/client-api";
import type { AvailabilitySlot, Reservation, ServiceType } from "@/types";

interface StaffReservationDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceTypes: ServiceType[];
  businessTimezone: string;
  businessMaxGuests: number;
  canOverride: boolean;
  mode: "create" | "reschedule";
  initialDate?: Date;
  onCompleted: (reservation: Reservation) => void;
}

function sameInstant(left: string, right: string) {
  return new Date(left).getTime() === new Date(right).getTime();
}

export function StaffReservationDialog({
  reservation,
  open,
  onOpenChange,
  serviceTypes,
  businessTimezone,
  businessMaxGuests,
  canOverride,
  mode,
  initialDate,
  onCompleted,
}: StaffReservationDialogProps) {
  const isCreate = mode === "create";
  const venueToday = useMemo(
    () => calendarDateForSlot(new Date().toISOString(), businessTimezone),
    [businessTimezone],
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [guests, setGuests] = useState("1");
  const [date, setDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [alternatives, setAlternatives] = useState<AvailabilitySlot[]>([]);
  const [availabilityTimezone, setAvailabilityTimezone] =
    useState(businessTimezone);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const selectedService = serviceTypes.find(
    (serviceType) => serviceType.id === serviceTypeId,
  );
  const maxPartySize = Math.max(
    0,
    Math.min(businessMaxGuests, selectedService?.capacity ?? businessMaxGuests),
  );
  const guestCount = Number(guests);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setEmail("");
    setNote("");
    setServiceTypeId(
      reservation?.serviceTypeId ?? serviceTypes[0]?.id ?? "",
    );
    setGuests(String(reservation?.guests ?? 1));
    setDate(
      reservation
        ? calendarDateForSlot(reservation.time, businessTimezone)
        : initialDate && initialDate >= venueToday
          ? initialDate
          : venueToday,
    );
    setSelectedSlot(null);
    setAvailableSlots([]);
    setAlternatives([]);
    setAvailabilityTimezone(businessTimezone);
    setAvailabilityError(null);
    setOverrideMode(false);
    setOverrideReason("");
  }, [
    businessTimezone,
    initialDate,
    open,
    reservation,
    serviceTypes,
    venueToday,
  ]);

  useEffect(() => {
    if (
      !open ||
      !serviceTypeId ||
      !date ||
      !Number.isInteger(guestCount) ||
      guestCount < 1 ||
      guestCount > maxPartySize
    ) {
      setAvailableSlots([]);
      return;
    }

    const controller = new AbortController();
    setLoadingAvailability(true);
    setAvailabilityError(null);
    const request = overrideMode
      ? clientGetStaffOverrideTimes({
          serviceTypeId,
          localDate: format(date, "yyyy-MM-dd"),
          guests: guestCount,
          signal: controller.signal,
        })
      : reservation
        ? clientGetReservationRescheduleAvailability({
            reservationId: reservation.id,
            serviceTypeId,
            startDate: format(date, "yyyy-MM-dd"),
            days: 1,
            guests: guestCount,
            signal: controller.signal,
          })
        : clientGetStaffReservationAvailability({
            serviceTypeId,
            startDate: format(date, "yyyy-MM-dd"),
            days: 1,
            guests: guestCount,
            signal: controller.signal,
          });

    request
      .then((availability) => {
        const slots = availability.dates[0]?.slots ?? [];
        setAvailableSlots(slots);
        setAvailabilityTimezone(availability.timezone);
        setSelectedSlot((current) => {
          if (
            current &&
            slots.some((slot) => sameInstant(slot.startsAt, current.startsAt))
          ) {
            return current;
          }
          if (
            !overrideMode &&
            reservation &&
            serviceTypeId === reservation.serviceTypeId &&
            guestCount === reservation.guests
          ) {
            return (
              slots.find((slot) => sameInstant(slot.startsAt, reservation.time)) ??
              null
            );
          }
          return null;
        });
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
        if (!controller.signal.aborted) setLoadingAvailability(false);
      });

    return () => controller.abort();
  }, [
    date,
    guestCount,
    maxPartySize,
    open,
    overrideMode,
    reservation,
    serviceTypeId,
  ]);

  if (mode === "reschedule" && !reservation) return null;

  const allocationChanged = Boolean(
    selectedSlot &&
      (isCreate ||
        !reservation ||
        !sameInstant(selectedSlot.startsAt, reservation.time) ||
        serviceTypeId !== reservation.serviceTypeId ||
        guestCount !== reservation.guests),
  );
  const contactValid =
    !isCreate ||
    Boolean(name.trim() && phone.trim() && email.trim() && email.includes("@"));
  const reasonValid = !overrideMode || overrideReason.trim().length >= 10;
  const canSubmit = allocationChanged && contactValid && reasonValid;

  const chooseAlternative = (slot: AvailabilitySlot) => {
    setDate(calendarDateForSlot(slot.startsAt, availabilityTimezone));
    setSelectedSlot(slot);
    setAlternatives([]);
    setAvailabilityError(null);
  };

  const submit = async () => {
    if (!selectedSlot || !canSubmit) return;
    setSubmitting(true);
    const allocation = {
      serviceTypeId,
      time: selectedSlot.startsAt,
      guests: guestCount,
      availabilityOverrideReason: overrideMode
        ? overrideReason.trim()
        : undefined,
    };
    try {
      const updated = isCreate
        ? await clientCreateStaffReservation({
            ...allocation,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            note: note.trim() || undefined,
          })
        : await clientRescheduleReservation(reservation!.id, allocation);
      toast.success(
        isCreate ? "Reservation created" : "Reservation rescheduled",
      );
      onCompleted(updated);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
        setAlternatives(getAvailabilityAlternatives(error));
        setSelectedSlot(null);
      }
      toast.error(
        error instanceof Error
          ? error.message
          : isCreate
            ? "Failed to create reservation"
            : "Failed to reschedule reservation",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const setAllocationField = (change: () => void) => {
    change();
    setSelectedSlot(null);
    setAlternatives([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? "New reservation" : "Reschedule reservation"}
          </DialogTitle>
          <DialogDescription>
            {overrideMode
              ? "Choose an exceptional venue-timezone slot and record why normal availability is being bypassed."
              : "Choose a server-approved slot. Existing capacity is changed only after the request succeeds."}
          </DialogDescription>
        </DialogHeader>

        {isCreate && (
          <div className="grid gap-4 border-b pb-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff-reservation-name">Guest name</Label>
              <Input id="staff-reservation-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-reservation-phone">Phone</Label>
              <Input id="staff-reservation-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-reservation-email">Email</Label>
              <Input id="staff-reservation-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-reservation-note">Note</Label>
              <Input id="staff-reservation-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-reservation-service">Booking type</Label>
              <Select value={serviceTypeId} onValueChange={(value) => setAllocationField(() => setServiceTypeId(value))}>
                <SelectTrigger id="staff-reservation-service"><SelectValue placeholder="Choose a booking type" /></SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((serviceType) => <SelectItem key={serviceType.id} value={serviceType.id}>{serviceType.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-reservation-guests">Party size</Label>
              <Input id="staff-reservation-guests" type="number" min="1" max={maxPartySize} value={guests} onChange={(event) => setAllocationField(() => setGuests(event.target.value))} />
              <p className="text-xs text-muted-foreground">Maximum {maxPartySize} for this booking type</p>
            </div>

            <Calendar mode="single" selected={date} onSelect={(value) => { if (value) setAllocationField(() => setDate(value)); }} disabled={{ before: venueToday }} className="rounded-md border" />

            {canOverride && (
              <Button type="button" /* Override is a mode, not a failure — it takes the primary
                    signature while it is on, and a hairline while it is off. */
                variant={overrideMode ? "primary" : "secondary"} className="w-full" onClick={() => { setOverrideMode((current) => !current); setSelectedSlot(null); setAlternatives([]); setOverrideReason(""); }}>
                <ShieldAlert /> {overrideMode ? "Return to normal availability" : "Override availability"}
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {reservation && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current booking</p>
                <p className="mt-1 font-medium">{formatSlotDate(reservation.time, businessTimezone)} at <span className="font-mono tabular-nums">{formatSlotTime(reservation.time, businessTimezone)}</span></p>
              </div>
            )}

            {overrideMode && (
              <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
                <div className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 shrink-0 text-destructive" /><p>This can bypass opening hours, closures, booking notice, advance horizon, and concurrent-booking limits. Party-size and tenant boundaries still apply.</p></div>
                <div className="space-y-2">
                  <Label htmlFor="availability-override-reason">Override reason</Label>
                  <Textarea id="availability-override-reason" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} minLength={10} maxLength={500} placeholder="Explain the operational reason (at least 10 characters)" />
                  <p className="text-xs text-muted-foreground">Recorded with your identity and timestamp for staff visibility.</p>
                </div>
              </div>
            )}

            <div><h3 className="font-medium">{overrideMode ? "Override time" : "Available times"}</h3><p className="text-sm text-muted-foreground">Times are shown in {availabilityTimezone}.</p></div>

            {loadingAvailability ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">Loading times…</div>
            ) : availabilityError ? (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{availabilityError}</p>
            ) : availableSlots.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{overrideMode ? "No future override times remain on this date." : "No available times for this date."}</p>
            ) : overrideMode ? (
              <Select value={selectedSlot?.startsAt ?? ""} onValueChange={(value) => { setSelectedSlot(availableSlots.find((slot) => slot.startsAt === value) ?? null); setAlternatives([]); }}>
                <SelectTrigger aria-label="Override time"><SelectValue placeholder="Choose an exceptional time" /></SelectTrigger>
                <SelectContent>{availableSlots.map((slot) => <SelectItem key={slot.startsAt} value={slot.startsAt}>{formatSlotTimeWithZone(slot.startsAt, availabilityTimezone)}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableSlots.map((slot) => {
                  const selected = selectedSlot ? sameInstant(slot.startsAt, selectedSlot.startsAt) : false;
                  return <Button key={slot.startsAt} type="button" variant={selected ? "primary" : "secondary"} onClick={() => { setSelectedSlot(slot); setAlternatives([]); }} aria-pressed={selected} className="font-mono tabular-nums">{formatSlotTime(slot.startsAt, availabilityTimezone)}</Button>;
                })}
              </div>
            )}

            {alternatives.length > 0 && (
              <div className="rounded-md border border-primary/30 p-3"><p className="mb-2 text-sm font-medium">That slot was just taken. Nearby options:</p><div className="flex flex-wrap gap-2">{alternatives.map((slot) => <Button key={slot.startsAt} type="button" variant="secondary" size="filter" onClick={() => chooseAlternative(slot)}>{formatSlotDate(slot.startsAt, availabilityTimezone)} · <span className="font-mono tabular-nums">{formatSlotTime(slot.startsAt, availabilityTimezone)}</span></Button>)}</div></div>
            )}

            {selectedSlot && allocationChanged && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><p className="flex items-center gap-2 font-medium"><CalendarClock /> {isCreate ? "Booking" : "New booking"}</p><p className="mt-1">{formatSlotDate(selectedSlot.startsAt, availabilityTimezone)} at <span className="font-mono tabular-nums">{formatSlotTime(selectedSlot.startsAt, availabilityTimezone)}</span> · {guestCount} {guestCount === 1 ? "guest" : "guests"}</p></div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? "Saving…" : overrideMode ? (isCreate ? "Create with override" : "Reschedule with override") : isCreate ? "Create reservation" : "Confirm reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
