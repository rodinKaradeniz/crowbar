import type { AvailabilitySlot, Reservation } from "@/types";

interface AvailabilityErrorLike {
  details: unknown;
}

interface SlotAlternativePayload {
  starts_at?: unknown;
  ends_at?: unknown;
}

export function formatSlotTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function formatSlotTimeWithZone(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatSlotDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function calendarDateForSlot(value: string, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === name)?.value);
  return new Date(part("year"), part("month") - 1, part("day"));
}

export function getAvailabilityAlternatives(
  error: AvailabilityErrorLike,
): AvailabilitySlot[] {
  if (!error.details || typeof error.details !== "object") return [];
  const raw = (error.details as { alternatives?: unknown }).alternatives;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as SlotAlternativePayload;
    if (
      typeof candidate.starts_at !== "string" ||
      typeof candidate.ends_at !== "string"
    ) {
      return [];
    }
    return [{ startsAt: candidate.starts_at, endsAt: candidate.ends_at }];
  });
}

export function isReservationReschedulable(
  reservation: Reservation,
  currentTime: string,
): boolean {
  return (
    (reservation.status === "pending" || reservation.status === "confirmed") &&
    new Date(reservation.time).getTime() > new Date(currentTime).getTime()
  );
}
