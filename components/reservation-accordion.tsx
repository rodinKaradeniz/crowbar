"use client";

import { format } from "date-fns";
import {
  Calendar,
  Clock,
  Users,
  MapPin,
  User,
  Mail,
  Phone,
  CreditCard,
  Tag,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getCustomerById,
  getTableById,
  getReservationTypeByReservation,
} from "@/mock-data";
import { Reservation } from "@/types";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ReservationAccordionProps {
  reservations: Reservation[];
  actionButtons?: (reservation: Reservation) => ReactNode;
  emptyMessage?: string;
}

export function ReservationAccordion({
  reservations,
  actionButtons,
  emptyMessage = "No reservations found.",
}: ReservationAccordionProps) {
  if (reservations.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible className="w-full space-y-4">
      {reservations.map((reservation) => {
        const customerInfo = getCustomerById(reservation.customerId);
        const tableInfo = getTableById(reservation.tableId);
        const reservationType = getReservationTypeByReservation(reservation);
        const reservationDate = new Date(reservation.time);

        return (
          <AccordionItem
            key={reservation.id}
            value={reservation.id}
            className="rounded-lg border bg-card last:border-b"
          >
            {/* Header row with full width justify-between */}
            <div className="flex items-center justify-between w-full px-6 py-4">
              {/* Left side: Reservation info */}
              <div className="flex items-center gap-6 text-sm flex-1 min-w-0">
                <div className="font-medium text-base">
                  {customerInfo?.name || "Unknown"}
                </div>
                {reservationType && (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: reservationType.color }}
                    />
                    <span className="text-muted-foreground text-xs">
                      {reservationType.name}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{format(reservationDate, "MMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{format(reservationDate, "h:mm a")}</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>
                    {reservation.guests}{" "}
                    {reservation.guests === 1 ? "guest" : "guests"}
                  </span>
                </div>
                {tableInfo && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{tableInfo.number}</span>
                  </div>
                )}
              </div>

              {/* Right side: Action buttons and Details button */}
              <div className="flex items-center gap-2 shrink-0">
                {actionButtons && actionButtons(reservation)}
                <AccordionTrigger className="group hover:no-underline p-0 w-auto [&>svg]:hidden inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all h-8 px-3 bg-background border border-input shadow-xs hover:bg-accent hover:text-accent-foreground">
                  <span className="group-data-[state=open]:hidden">
                    See Details
                  </span>
                  <span className="hidden group-data-[state=open]:inline">
                    Hide Details
                  </span>
                </AccordionTrigger>
              </div>
            </div>

            <AccordionContent className="pb-4 px-6">
              <div className="space-y-4 pt-2">
                {/* Contact Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Contact Information</h4>
                  <div className="space-y-2">
                    <div className="contact-row">
                      <User className="contact-icon" />
                      <span className="font-medium">{customerInfo?.name}</span>
                    </div>
                    <div className="contact-row">
                      <Mail className="contact-icon" />
                      <span>{customerInfo?.email}</span>
                    </div>
                    {customerInfo?.phone && (
                      <div className="contact-row">
                        <Phone className="contact-icon" />
                        <span>{customerInfo.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reservation Details */}
                <div className="space-y-3 pt-4 border-t">
                  <h4 className="text-sm font-medium">Reservation Details</h4>
                  <div className="space-y-2">
                    <div className="contact-row">
                      <Calendar className="contact-icon" />
                      <div>
                        <p className="text-sm font-medium">
                          {format(reservationDate, "EEEE, MMMM d, yyyy")}
                        </p>
                        <p className="section-subtitle">
                          {format(reservationDate, "h:mm a")}
                        </p>
                      </div>
                    </div>
                    <div className="contact-row">
                      <Users className="contact-icon" />
                      <span>
                        {reservation.guests}{" "}
                        {reservation.guests === 1 ? "guest" : "guests"}
                      </span>
                    </div>
                    {tableInfo && (
                      <div className="contact-row">
                        <MapPin className="contact-icon" />
                        <span>
                          Table: {tableInfo.number} (Capacity:{" "}
                          {tableInfo.capacity})
                        </span>
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
                          {reservationType.description && (
                            <span className="text-muted-foreground text-xs">
                              - {reservationType.description}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Information */}
                {reservation.paymentStatus && (
                  <div className="space-y-2 pt-4 border-t">
                    <h4 className="text-sm font-medium">Payment Information</h4>
                    <div className="space-y-2">
                      <div className="contact-row">
                        <CreditCard className="contact-icon" />
                        <div className="flex items-center gap-2">
                          <span className="text-sm">Status:</span>
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
                        </div>
                      </div>
                      {reservation.paymentAmount && (
                        <div className="contact-row">
                          <CreditCard className="contact-icon" />
                          <span className="text-sm">
                            Amount: ${reservation.paymentAmount.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Special Notes */}
                {reservation.note && (
                  <div className="space-y-2 pt-4 border-t">
                    <h4 className="text-sm font-medium">Special Notes</h4>
                    <p className="section-subtitle">{reservation.note}</p>
                  </div>
                )}

                {/* Timestamps */}
                <div className="space-y-2 pt-4 border-t">
                  <h4 className="text-sm font-medium">Request Timeline</h4>
                  <div className="space-y-2">
                    <div className="contact-row">
                      <Clock className="contact-icon" />
                      <span className="text-sm text-muted-foreground">
                        Requested:{" "}
                        {format(
                          new Date(reservation.createdAt),
                          "MMM d, yyyy 'at' h:mm a"
                        )}
                      </span>
                    </div>
                    {reservation.updatedAt !== reservation.createdAt && (
                      <div className="contact-row">
                        <Clock className="contact-icon" />
                        <span className="text-sm text-muted-foreground">
                          Last updated:{" "}
                          {format(
                            new Date(reservation.updatedAt),
                            "MMM d, yyyy 'at' h:mm a"
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}