"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar, Clock, Users, MapPin, Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Reservation, Business, ServiceType } from "@/types";
import {
  clientGetBusiness,
  clientGetServiceType,
} from "@/lib/client-api";

interface CustomerReservationsClientProps {
  reservations: Reservation[];
}

export default function CustomerReservationsClient({
  reservations,
}: CustomerReservationsClientProps) {
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);
  const [businessCache, setBusinessCache] = useState<Map<string, Business>>(
    new Map()
  );
  const [serviceTypeCache, setServiceTypeCache] = useState<
    Map<string, ServiceType>
  >(new Map());

  // Fetch business and service type details for all reservations
  useEffect(() => {
    const businessIds = [...new Set(reservations.map((r) => r.businessId))];
    const serviceTypeIds = [
      ...new Set(reservations.map((r) => r.serviceTypeId)),
    ];

    businessIds.forEach((id) => {
      if (!businessCache.has(id)) {
        clientGetBusiness(id).then((b) => {
          if (b) setBusinessCache((prev) => new Map(prev).set(id, b));
        });
      }
    });

    serviceTypeIds.forEach((id) => {
      if (!serviceTypeCache.has(id)) {
        clientGetServiceType(id).then((st) => {
          if (st) setServiceTypeCache((prev) => new Map(prev).set(id, st));
        });
      }
    });
  }, [reservations]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReservationClick = (reservation: Reservation) => {
    setSelectedReservation(reservation);
  };

  const business = selectedReservation
    ? businessCache.get(selectedReservation.businessId) || null
    : null;
  const serviceType = selectedReservation
    ? serviceTypeCache.get(selectedReservation.serviceTypeId) || null
    : null;

  return (
    <div className="page-container">
      <div>
        <h1 className="page-title">Reservations</h1>
        <p className="page-description">View your confirmed reservations</p>
      </div>

      {reservations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            You don&apos;t have any confirmed reservations yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {reservations.map((reservation) => {
            const businessInfo = businessCache.get(reservation.businessId);
            const serviceTypeInfo = serviceTypeCache.get(
              reservation.serviceTypeId
            );
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
                      <h3 className="section-title">
                        {businessInfo?.name || "Loading..."}
                      </h3>
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        Confirmed
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
                      {serviceTypeInfo && (
                        <div className="contact-row">
                          <MapPin className="contact-icon" />
                          <span>
                            {serviceTypeInfo.name}
                            {reservation.meetingLink && (
                              <span className="ml-1.5 inline-flex items-center gap-1 text-primary text-xs">
                                <Video className="h-3 w-3" />
                                Online
                              </span>
                            )}
                          </span>
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
      {selectedReservation && (
        <Dialog
          open={!!selectedReservation}
          onOpenChange={() => setSelectedReservation(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reservation Details</DialogTitle>
              <DialogDescription>
                View complete information about your reservation
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {business && (
                <div>
                  <h3 className="font-medium mb-2">{business.name}</h3>
                  {business.address && (
                    <p className="section-subtitle">{business.address}</p>
                  )}
                </div>
              )}
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
                {serviceType && (
                  <div className="contact-row">
                    <MapPin className="contact-icon" />
                    <span>Service: {serviceType.name}</span>
                  </div>
                )}
                <div className="contact-row">
                  <Clock className="contact-icon" />
                  <span>
                    Created:{" "}
                    {format(
                      new Date(selectedReservation.createdAt),
                      "MMM d, yyyy 'at' h:mm a"
                    )}
                  </span>
                </div>
                {selectedReservation.meetingLink && (
                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium mb-2">Online Meeting</p>
                    <a
                      href={selectedReservation.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-primary hover:underline"
                    >
                      <Video className="h-4 w-4" />
                      Join Google Meet
                    </a>
                  </div>
                )}
                {selectedReservation.note && (
                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium mb-1">Special Notes</p>
                    <p className="section-subtitle">
                      {selectedReservation.note}
                    </p>
                  </div>
                )}
                {selectedReservation.customFields &&
                  Object.keys(selectedReservation.customFields).length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm font-medium mb-2">
                        Additional Information
                      </p>
                      <div className="space-y-1">
                        {Object.entries(selectedReservation.customFields).map(
                          ([fieldId, value]) => {
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
      )}
    </div>
  );
}
