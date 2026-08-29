"use client";

import { CalendarClock, Clock, Users, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Reservation, ServiceType } from "@/types";
import { CustomerResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { isReservationReschedulable } from "@/lib/availability";
import { ReservationOverrideNotice } from "@/components/reservation-override-notice";
import type { ReactNode } from "react";
import { formatBusinessTime } from "@/lib/business-time";
import { useRegionalSettings } from "@/contexts/regional-context";

interface ReservationDetailsDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  serviceTypes?: ServiceType[];
  customers?: CustomerResponse[];
  onReschedule?: (reservation: Reservation) => void;
  currentTime?: string;
  businessTimezone: string;
  tablePlan?: ReactNode;
}

export function ReservationDetailsDialog({
  reservation,
  open,
  onOpenChange,
  title = "Reservation Details",
  description = "View complete information about this reservation",
  serviceTypes = [],
  customers = [],
  onReschedule,
  currentTime,
  businessTimezone,
  tablePlan,
}: ReservationDetailsDialogProps) {
  const { locale } = useRegionalSettings();
  if (!reservation) return null;

  const customer = customers.find((c) => c.id === reservation.customerId);
  const serviceType = serviceTypes.find((st) => st.id === reservation.serviceTypeId);
  const canReschedule = Boolean(
    onReschedule &&
      currentTime &&
      isReservationReschedulable(reservation, currentTime),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {customer && (
            <div>
              <div className="flex items-center gap-3 text-[length:var(--ui-size)] mb-2">
                <div>
                  <h3 className="font-medium">{customer.name}</h3>
                  <p className="text-[length:var(--ui-size)] text-muted-foreground">{customer.email}</p>
                  {customer.phone && (
                    <p className="text-[length:var(--ui-size)] text-muted-foreground">{customer.phone}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-3 text-[length:var(--ui-size)]">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatBusinessTime(reservation.time, businessTimezone, locale)}</span>
            </div>
            <div className="flex items-center gap-3 text-[length:var(--ui-size)]">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>
                {reservation.guests}{" "}
                {reservation.guests === 1 ? "guest" : "guests"}
              </span>
            </div>
            {serviceType && (
              <div className="flex items-center gap-3 text-[length:var(--ui-size)]">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: serviceType.color }}
                  />
                  <span>{serviceType.name}</span>
                  <span className="text-muted-foreground text-xs">
                    (Capacity: {serviceType.capacity})
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 text-[length:var(--ui-size)]">
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-accent text-accent-foreground">
                {reservation.status}
              </span>
            </div>
            {reservation.note && (
              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-1">Special Notes</p>
                <p className="text-[length:var(--ui-size)] text-muted-foreground">{reservation.note}</p>
              </div>
            )}
            <ReservationOverrideNotice reservation={reservation} businessTimezone={businessTimezone} />
            {tablePlan && <div className="pt-2 border-t">{tablePlan}</div>}
          </div>
          {canReschedule && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => onReschedule?.(reservation)}
            >
              <CalendarClock /> Reschedule
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
