"use client";

import { format, parseISO } from "date-fns";
import { ShieldAlert } from "lucide-react";
import type { Reservation } from "@/types";

interface ReservationOverrideNoticeProps {
  reservation: Reservation;
  compact?: boolean;
}

export function ReservationOverrideNotice({
  reservation,
  compact = false,
}: ReservationOverrideNoticeProps) {
  if (!reservation.availabilityOverrideReason) return null;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"
        title={reservation.availabilityOverrideReason}
      >
        <ShieldAlert className="h-3 w-3" /> Override
      </span>
    );
  }

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-destructive">
        <ShieldAlert className="h-4 w-4" /> Availability override
      </p>
      <p className="mt-1">{reservation.availabilityOverrideReason}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {reservation.availabilityOverrideActorName || "Authorized staff member"}
        {reservation.availabilityOverriddenAt
          ? ` · ${format(
              parseISO(reservation.availabilityOverriddenAt),
              "MMM d, yyyy 'at' h:mm a",
            )}`
          : ""}
      </p>
    </div>
  );
}
