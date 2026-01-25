"use client";

import { format, parseISO } from "date-fns";
import { Clock, Users, MapPin, User, Tag, CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCustomerById,
  getTableById,
  getReservationTypeByReservation,
} from "@/mock-data";
import { Reservation } from "@/types";
import { cn } from "@/lib/utils";

interface ReservationDetailsDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}

export function ReservationDetailsDialog({
  reservation,
  open,
  onOpenChange,
  title = "Reservation Details",
  description = "View complete information about this reservation",
}: ReservationDetailsDialogProps) {
  if (!reservation) return null;

  const customer = getCustomerById(reservation.customerId);
  const table = getTableById(reservation.tableId);
  const reservationType = getReservationTypeByReservation(reservation);

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
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
            {table && (
              <div className="contact-row">
                <MapPin className="contact-icon" />
                <span>Table: {table.number}</span>
              </div>
            )}
            {reservationType && (
              <div className="contact-row">
                <Tag className="contact-icon" />
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: reservationType.color }}
                  />
                  <span>{reservationType.name}</span>
                </div>
              </div>
            )}
            <div className="contact-row">
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-accent text-accent-foreground">
                {reservation.status}
              </span>
            </div>
            {reservation.paymentStatus && (
              <div className="contact-row">
                <CreditCard className="contact-icon" />
                <div className="flex items-center gap-2">
                  <span className="text-sm">Payment:</span>
                  <span
                    className={cn(
                      "text-xs px-2 py-1 rounded-full capitalize",
                      reservation.paymentStatus === "paid"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : reservation.paymentStatus === "pending"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    )}
                  >
                    {reservation.paymentStatus}
                  </span>
                  {reservation.paymentAmount && (
                    <span className="text-sm text-muted-foreground">
                      ${reservation.paymentAmount.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            )}
            {reservation.note && (
              <div className="pt-2 border-t">
                <p className="text-sm font-medium mb-1">Special Notes</p>
                <p className="section-subtitle">{reservation.note}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}