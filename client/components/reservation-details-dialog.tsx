"use client";

import { format, parseISO } from "date-fns";
import { Clock, Users, Tag, CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Reservation, ServiceType } from "@/types";
import { UserResponse } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface ReservationDetailsDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  serviceTypes?: ServiceType[];
  customers?: UserResponse[];
}

export function ReservationDetailsDialog({
  reservation,
  open,
  onOpenChange,
  title = "Reservation Details",
  description = "View complete information about this reservation",
  serviceTypes = [],
  customers = [],
}: ReservationDetailsDialogProps) {
  if (!reservation) return null;

  const customer = customers.find((c) => c.id === reservation.customerId);
  const serviceType = serviceTypes.find((st) => st.id === reservation.serviceTypeId);

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
            {reservation.customFields &&
              Object.keys(reservation.customFields).length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-2">Additional Information</p>
                  <div className="space-y-2">
                    {Object.entries(reservation.customFields).map(
                      ([fieldId, value]) => {
                        // Try to find the field label from the service type's form definition
                        const fieldDef = serviceType?.formFields?.find(
                          (f) => f.id === fieldId
                        );
                        const label = fieldDef?.label || fieldId;
                        const displayValue =
                          typeof value === "boolean"
                            ? value
                              ? "Yes"
                              : "No"
                            : String(value ?? "—");

                        return (
                          <div key={fieldId}>
                            <p className="text-xs text-muted-foreground">
                              {label}
                            </p>
                            <p className="text-sm">{displayValue}</p>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
