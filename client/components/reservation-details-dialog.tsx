"use client";

import { format, parseISO } from "date-fns";
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
}: ReservationDetailsDialogProps) {
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
              <div className="contact-row mb-2">
                <div>
                  <h3 className="font-medium">{customer.name}</h3>
                  <p className="section-subtitle">{customer.email}</p>
                  {customer.phone && (
                    <p className="section-subtitle">{customer.phone}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="space-y-3 pt-4 border-t">
            <div className="contact-row">
              <Clock className="contact-icon" />
              <span>{format(parseISO(reservation.time), "h:mm a")}</span>
            </div>
            <div className="contact-row">
              <Users className="contact-icon" />
              <span>
                {reservation.guests}{" "}
                {reservation.guests === 1 ? "guest" : "guests"}
              </span>
            </div>
            {serviceType && (
              <div className="contact-row">
                <Tag className="contact-icon" />
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
            <div className="contact-row">
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-accent text-accent-foreground">
                {reservation.status}
              </span>
            </div>
            {reservation.note && (
              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-1">Special Notes</p>
                <p className="section-subtitle">{reservation.note}</p>
              </div>
            )}
          </div>
          {canReschedule && (
            <Button
              type="button"
              variant="outline"
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
