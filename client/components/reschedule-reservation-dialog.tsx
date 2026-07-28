"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Loader2 } from "lucide-react";
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
import {
  calendarDateForSlot,
  formatSlotDate,
  formatSlotTime,
  getAvailabilityAlternatives,
} from "@/lib/availability";
import {
  ClientApiError,
  clientGetReservationRescheduleAvailability,
  clientRescheduleReservation,
} from "@/lib/client-api";
import type { AvailabilitySlot, Reservation, ServiceType } from "@/types";

interface RescheduleReservationDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceTypes: ServiceType[];
  businessTimezone: string;
  businessMaxGuests: number;
  onRescheduled: (reservation: Reservation) => void;
}

function sameInstant(left: string, right: string) {
  return new Date(left).getTime() === new Date(right).getTime();
}

export function RescheduleReservationDialog({
  reservation,
  open,
  onOpenChange,
  serviceTypes,
  businessTimezone,
  businessMaxGuests,
  onRescheduled,
}: RescheduleReservationDialogProps) {
  const venueToday = useMemo(
    () => calendarDateForSlot(new Date().toISOString(), businessTimezone),
    [businessTimezone],
  );
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [guests, setGuests] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [alternatives, setAlternatives] = useState<AvailabilitySlot[]>([]);
  const [availabilityTimezone, setAvailabilityTimezone] =
    useState(businessTimezone);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedService = serviceTypes.find(
    (serviceType) => serviceType.id === serviceTypeId,
  );
  const maxPartySize = Math.max(
    0,
    Math.min(businessMaxGuests, selectedService?.capacity ?? businessMaxGuests),
  );
  const guestCount = Number(guests);

  useEffect(() => {
    if (!open || !reservation) return;
    setServiceTypeId(reservation.serviceTypeId);
    setGuests(String(reservation.guests));
    setDate(calendarDateForSlot(reservation.time, businessTimezone));
    setSelectedSlot(null);
    setAvailableSlots([]);
    setAlternatives([]);
    setAvailabilityTimezone(businessTimezone);
    setAvailabilityError(null);
  }, [businessTimezone, open, reservation]);

  useEffect(() => {
    if (
      !open ||
      !reservation ||
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
    clientGetReservationRescheduleAvailability({
      reservationId: reservation.id,
      serviceTypeId,
      startDate: format(date, "yyyy-MM-dd"),
      days: 1,
      guests: guestCount,
      signal: controller.signal,
    })
      .then((availability) => {
        const slots = availability.dates[0]?.slots ?? [];
        setAvailableSlots(slots);
        setAvailabilityTimezone(availability.timezone);
        setSelectedSlot((current) => {
          if (current && slots.some((slot) => sameInstant(slot.startsAt, current.startsAt))) {
            return current;
          }
          if (
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
    reservation,
    serviceTypeId,
  ]);

  if (!reservation) return null;

  const hasChanged = Boolean(
    selectedSlot &&
      (!sameInstant(selectedSlot.startsAt, reservation.time) ||
        serviceTypeId !== reservation.serviceTypeId ||
        guestCount !== reservation.guests),
  );

  const chooseAlternative = (slot: AvailabilitySlot) => {
    setDate(calendarDateForSlot(slot.startsAt, availabilityTimezone));
    setSelectedSlot(slot);
    setAlternatives([]);
    setAvailabilityError(null);
  };

  const submit = async () => {
    if (!selectedSlot || !hasChanged) return;
    setSubmitting(true);
    try {
      const updated = await clientRescheduleReservation(reservation.id, {
        serviceTypeId,
        time: selectedSlot.startsAt,
        guests: guestCount,
      });
      toast.success("Reservation rescheduled");
      onRescheduled(updated);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ClientApiError && error.code === "SLOT_UNAVAILABLE") {
        setAlternatives(getAvailabilityAlternatives(error));
        setSelectedSlot(null);
      }
      toast.error(
        error instanceof Error ? error.message : "Failed to reschedule reservation",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule reservation</DialogTitle>
          <DialogDescription>
            Choose a server-approved slot. The existing booking remains unchanged until the move succeeds.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reschedule-service">Booking type</Label>
              <Select
                value={serviceTypeId}
                onValueChange={(value) => {
                  setServiceTypeId(value);
                  setSelectedSlot(null);
                  setAlternatives([]);
                }}
              >
                <SelectTrigger id="reschedule-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((serviceType) => (
                    <SelectItem key={serviceType.id} value={serviceType.id}>
                      {serviceType.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reschedule-guests">Party size</Label>
              <Input
                id="reschedule-guests"
                type="number"
                min="1"
                max={maxPartySize}
                value={guests}
                onChange={(event) => {
                  setGuests(event.target.value);
                  setSelectedSlot(null);
                  setAlternatives([]);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Maximum {maxPartySize} for this booking type
              </p>
            </div>

            <Calendar
              mode="single"
              selected={date}
              onSelect={(value) => {
                if (!value) return;
                setDate(value);
                setSelectedSlot(null);
                setAlternatives([]);
              }}
              disabled={{ before: venueToday }}
              className="rounded-md border"
            />
          </div>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Current booking
              </p>
              <p className="mt-1 font-medium">
                {formatSlotDate(reservation.time, businessTimezone)} at{" "}
                <span className="figures">
                  {formatSlotTime(reservation.time, businessTimezone)}
                </span>
              </p>
            </div>

            <div>
              <h3 className="font-medium">Available times</h3>
              <p className="text-sm text-muted-foreground">
                Times are shown in {availabilityTimezone}.
              </p>
            </div>

            {loadingAvailability ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" /> Loading availability…
              </div>
            ) : availabilityError ? (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {availabilityError}
              </p>
            ) : availableSlots.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No available times for this date.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableSlots.map((slot) => {
                  const selected = selectedSlot
                    ? sameInstant(slot.startsAt, selectedSlot.startsAt)
                    : false;
                  return (
                    <Button
                      key={slot.startsAt}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      onClick={() => {
                        setSelectedSlot(slot);
                        setAlternatives([]);
                      }}
                      aria-pressed={selected}
                      className="figures"
                    >
                      {formatSlotTime(slot.startsAt, availabilityTimezone)}
                    </Button>
                  );
                })}
              </div>
            )}

            {alternatives.length > 0 && (
              <div className="rounded-md border border-primary/30 p-3">
                <p className="mb-2 text-sm font-medium">
                  That slot was just taken. Nearby options:
                </p>
                <div className="flex flex-wrap gap-2">
                  {alternatives.map((slot) => (
                    <Button
                      key={slot.startsAt}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => chooseAlternative(slot)}
                    >
                      {formatSlotDate(slot.startsAt, availabilityTimezone)} ·{" "}
                      <span className="figures">
                        {formatSlotTime(slot.startsAt, availabilityTimezone)}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {selectedSlot && hasChanged && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <CalendarClock /> New booking
                </p>
                <p className="mt-1">
                  {formatSlotDate(selectedSlot.startsAt, availabilityTimezone)} at{" "}
                  <span className="figures">
                    {formatSlotTime(selectedSlot.startsAt, availabilityTimezone)}
                  </span>{" "}
                  · {guestCount} {guestCount === 1 ? "guest" : "guests"}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!hasChanged || submitting}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" /> Rescheduling…
              </>
            ) : (
              "Confirm reschedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
