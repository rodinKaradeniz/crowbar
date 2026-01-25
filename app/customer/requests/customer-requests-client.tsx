"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar, Clock, Users, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getReservationsByCustomerId,
  getTableById,
  getVenueById,
} from "@/mock-data";
import { Reservation } from "@/types";

interface CustomerRequestsClientProps {
  customerId: string;
}

export default function CustomerRequestsClient({
  customerId,
}: CustomerRequestsClientProps) {
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  const reservations = getReservationsByCustomerId(customerId).filter(
    (r) => r.status === "pending"
  );

  const handleReservationClick = (reservation: Reservation) => {
    setSelectedReservation(reservation);
  };

  const venue = selectedReservation
    ? getVenueById(selectedReservation.venueId)
    : null;
  const table = selectedReservation
    ? getTableById(selectedReservation.tableId)
    : null;

  return (
    <div className="page-container">
      <div>
        <h1 className="page-title">Requests</h1>
        <p className="page-description">
          View your pending reservation requests
        </p>
      </div>

      {reservations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            You don&apos;t have any pending requests.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {reservations.map((reservation) => {
            const venueInfo = getVenueById(reservation.venueId);
            const tableInfo = getTableById(reservation.tableId);
            const reservationDate = new Date(reservation.time);

            return (
              <div
                key={reservation.id}
                onClick={() => handleReservationClick(reservation)}
                className="rounded-lg border bg-card p-6 cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="section-title">{venueInfo?.name}</h3>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                        Pending
                      </span>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="contact-row">
                        <Calendar className="contact-icon" />
                        <span>
                          {format(reservationDate, "EEEE, MMMM d, yyyy")}
                        </span>
                      </div>
                      <div className="contact-row">
                        <Clock className="contact-icon" />
                        <span>{format(reservationDate, "h:mm a")}</span>
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
                          <span>{tableInfo.number}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reservation Details Dialog */}
      {selectedReservation && venue && (
        <Dialog
          open={!!selectedReservation}
          onOpenChange={() => setSelectedReservation(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Request Details</DialogTitle>
              <DialogDescription>
                View complete information about your reservation request
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <h3 className="font-medium mb-2">{venue.name}</h3>
                {venue.address && (
                  <p className="section-subtitle">{venue.address}</p>
                )}
              </div>
              <div className="space-y-3 pt-4 border-t">
                <div className="contact-row">
                  <Calendar className="contact-icon" />
                  <div>
                    <p className="text-sm font-medium">
                      {format(
                        new Date(selectedReservation.time),
                        "EEEE, MMMM d, yyyy"
                      )}
                    </p>
                    <p className="section-subtitle">
                      {format(new Date(selectedReservation.time), "h:mm a")}
                    </p>
                  </div>
                </div>
                <div className="contact-row">
                  <Users className="contact-icon" />
                  <span>
                    {selectedReservation.guests}{" "}
                    {selectedReservation.guests === 1 ? "guest" : "guests"}
                  </span>
                </div>
                {table && (
                  <div className="contact-row">
                    <MapPin className="contact-icon" />
                    <span>Table: {table.number}</span>
                  </div>
                )}
                <div className="contact-row">
                  <Clock className="contact-icon" />
                  <span>
                    Requested:{" "}
                    {format(
                      new Date(selectedReservation.createdAt),
                      "MMM d, yyyy 'at' h:mm a"
                    )}
                  </span>
                </div>
                {selectedReservation.note && (
                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium mb-1">Special Notes</p>
                    <p className="section-subtitle">
                      {selectedReservation.note}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
