"use client";

import { useState, useMemo } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Clock, Users, Tag } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Business, Reservation, ServiceType } from "@/types";
import { UserResponse } from "@/lib/api-client";
import { ReservationDetailsDialog } from "@/components/reservation-details-dialog";

interface BusinessScheduleClientProps {
  business: Business;
  initialReservations: Reservation[];
  serviceTypes: ServiceType[];
  customers: UserResponse[];
}

export default function BusinessScheduleClient({
  business,
  initialReservations,
  serviceTypes,
  customers,
}: BusinessScheduleClientProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  const customerMap = useMemo(() => {
    const map = new Map<string, UserResponse>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const serviceTypeMap = useMemo(() => {
    const map = new Map<string, ServiceType>();
    serviceTypes.forEach((st) => map.set(st.id, st));
    return map;
  }, [serviceTypes]);

  // Filter reservations for selected date
  const dayReservations = useMemo(() => {
    return initialReservations.filter((reservation) => {
      const reservationDate = parseISO(reservation.time);
      return isSameDay(reservationDate, selectedDate);
    });
  }, [initialReservations, selectedDate]);

  // Get operating hours for the selected day
  const operatingHours = useMemo(() => {
    const dayName = format(selectedDate, "EEEE").toLowerCase();
    const hours = business.operatingHours[dayName];
    if (!hours || hours.closed === true) return null;

    const [openHour] = (hours as { open: string; close: string }).open.split(":").map(Number);
    let [closeHour] = (hours as { open: string; close: string }).close.split(":").map(Number);

    if (closeHour < openHour) {
      closeHour += 24;
    }

    return { open: openHour, close: closeHour };
  }, [business, selectedDate]);

  const timeSlots = useMemo(() => {
    if (!operatingHours) return [];
    const slots: Array<{ displayHour: number; actualHour: number }> = [];

    for (let hour = operatingHours.open; hour <= operatingHours.close; hour++) {
      slots.push({
        displayHour: hour % 24,
        actualHour: hour,
      });
    }

    return slots;
  }, [operatingHours]);

  const getEventPosition = (reservation: Reservation) => {
    if (!operatingHours) return { top: 0, height: 0 };
    const reservationDate = parseISO(reservation.time);

    const reservationHour = reservationDate.getHours();
    const reservationMinutes = reservationDate.getMinutes();

    const reservationTotalMinutes = reservationHour * 60 + reservationMinutes;
    const openTotalMinutes = operatingHours.open * 60;
    let closeTotalMinutes = operatingHours.close * 60;

    if (operatingHours.close > 24) {
      closeTotalMinutes = (operatingHours.close - 24) * 60 + 24 * 60;
    } else if (operatingHours.close < operatingHours.open) {
      closeTotalMinutes = operatingHours.close * 60 + 24 * 60;
    }

    const totalOperatingMinutes = closeTotalMinutes - openTotalMinutes;

    let minutesFromStart = reservationTotalMinutes - openTotalMinutes;

    if (minutesFromStart < 0 && (operatingHours.close > 24 || operatingHours.close < operatingHours.open)) {
      minutesFromStart += 24 * 60;
    }

    minutesFromStart = Math.max(0, Math.min(minutesFromStart, totalOperatingMinutes));

    const topPercent = totalOperatingMinutes > 0 ? (minutesFromStart / totalOperatingMinutes) * 100 : 0;

    const reservationDurationMinutes = business.reservationTime || 60;
    const heightPercent = totalOperatingMinutes > 0
      ? (reservationDurationMinutes / totalOperatingMinutes) * 100
      : 0;

    return {
      top: topPercent,
      height: Math.max(heightPercent, 1),
    };
  };

  const getTimeMarkerPosition = (actualHour: number) => {
    if (!operatingHours) return 0;

    const hourTotalMinutes = actualHour * 60;
    const openTotalMinutes = operatingHours.open * 60;
    let closeTotalMinutes = operatingHours.close * 60;

    if (operatingHours.close > 24) {
      closeTotalMinutes = (operatingHours.close - 24) * 60 + 24 * 60;
    } else if (operatingHours.close < operatingHours.open) {
      closeTotalMinutes = operatingHours.close * 60 + 24 * 60;
    }

    const totalOperatingMinutes = closeTotalMinutes - openTotalMinutes;
    let minutesFromStart = hourTotalMinutes - openTotalMinutes;

    if (minutesFromStart < 0 && (operatingHours.close > 24 || operatingHours.close < operatingHours.open)) {
      minutesFromStart += 24 * 60;
    }

    return totalOperatingMinutes > 0
      ? (minutesFromStart / totalOperatingMinutes) * 100
      : 0;
  };

  const getReservationsForServiceType = (serviceTypeId: string) => {
    return dayReservations.filter((r) => r.serviceTypeId === serviceTypeId);
  };

  const handleReservationClick = (reservation: Reservation) => {
    setSelectedReservation(reservation);
  };

  if (!operatingHours) {
    return (
      <div className="page-container">
        <div>
          <h1 className="page-title">Schedule</h1>
          <p className="page-description">
            View your daily schedule and reservations. Click on each reservation for more details.
          </p>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            Closed on {format(selectedDate, "EEEE")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div>
        <h1 className="page-title">Schedule</h1>
        <p className="page-description">
          View your daily schedule and reservations
        </p>
      </div>

      {/* Date Selector and Legend */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-[240px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Legend */}
        {serviceTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Tag className="h-4 w-4" />
              <span>Service Types:</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {serviceTypes.map((serviceType) => (
                <div
                  key={serviceType.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: serviceType.color }}
                  />
                  <span className="text-muted-foreground">{serviceType.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="timeline-container">
        {dayReservations.length === 0 && serviceTypes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No reservations scheduled for{" "}
              {format(selectedDate, "EEEE, MMMM d")}
            </p>
          </div>
        ) : (
          <div className="flex gap-4">
            {/* Time labels column */}
            <div className="shrink-0 w-20">
              <div className="h-12 border-b border-border" />
              <div className="space-y-0">
                {timeSlots.map((slot) => (
                  <div key={slot.actualHour} className="timeline-hour">
                    <div className="timeline-hour-label">
                      {format(new Date().setHours(slot.displayHour, 0, 0, 0), "h:mm a")}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-x-auto">
              <div
                className="timeline-grid"
                style={{
                  gridTemplateColumns: `repeat(${serviceTypes.length}, minmax(200px, 1fr))`,
                }}
              >
                {serviceTypes.map((serviceType) => {
                  const serviceTypeReservations = getReservationsForServiceType(serviceType.id);
                  return (
                    <div key={serviceType.id} className="timeline-column">
                      <div className="timeline-column-header">
                        <div className="font-medium">{serviceType.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Capacity: {serviceType.capacity}
                        </div>
                      </div>

                      <div
                        className="relative"
                        style={{
                          height: '100%',
                          minHeight: `${timeSlots.length * 60}px`,
                        }}
                      >
                        <div className="absolute inset-0">
                          {timeSlots.map((slot) => {
                            const positionPercent = getTimeMarkerPosition(slot.actualHour);
                            return (
                              <div
                                key={`${slot.actualHour}`}
                                className="absolute left-0 right-0 border-b border-border"
                                style={{ top: `${positionPercent}%` }}
                              />
                            );
                          })}
                        </div>

                        {serviceTypeReservations.map((reservation) => {
                          const position = getEventPosition(reservation);
                          const reservationDate = parseISO(reservation.time);
                          const customerInfo = customerMap.get(reservation.customerId);
                          const reservationColor = serviceType.color || "#6b7280";

                          return (
                            <div
                              key={reservation.id}
                              className="timeline-event cursor-pointer border-2"
                              style={{
                                top: `${position.top}%`,
                                height: `${Math.max(position.height, 4)}%`,
                                minHeight: "60px",
                                left: "4px",
                                right: "4px",
                                backgroundColor: `${reservationColor}20`,
                                borderColor: reservationColor,
                                color: reservationColor,
                              }}
                              onClick={() => handleReservationClick(reservation)}
                            >
                              <div className="flex items-center gap-2 text-sm overflow-hidden whitespace-nowrap h-full p-2">
                                <div className="font-medium truncate">
                                  {customerInfo?.name || "Unknown"}
                                </div>
                                <span className="opacity-60">•</span>
                                <div className="flex items-center gap-1 text-xs opacity-70 shrink-0">
                                  <Clock className="h-3 w-3" />
                                  <span>{format(reservationDate, "h:mm a")}</span>
                                </div>
                                <span className="opacity-60">•</span>
                                <div className="flex items-center gap-1 text-xs opacity-70 shrink-0">
                                  <Users className="h-3 w-3" />
                                  <span>{reservation.guests}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reservation Details Dialog */}
      <ReservationDetailsDialog
        reservation={selectedReservation}
        open={!!selectedReservation}
        onOpenChange={(open) => !open && setSelectedReservation(null)}
        serviceTypes={serviceTypes}
        customers={customers}
      />
    </div>
  );
}
