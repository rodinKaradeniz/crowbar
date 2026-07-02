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

  // Pixel height per hour slot — must match .timeline-hour { height: 60px } in globals.css
  const SLOT_HEIGHT = 60;
  // Header height — must match div.h-12 spacer in the label column and .timeline-column-header
  const HEADER_HEIGHT = 48;

  const getEventPositionPx = (reservation: Reservation) => {
    if (!operatingHours) return { topPx: 0, heightPx: SLOT_HEIGHT };
    const reservationDate = parseISO(reservation.time);

    let reservationHour = reservationDate.getHours();
    const reservationMinutes = reservationDate.getMinutes();

    // For overnight hours (e.g. midnight = hour 0 should map to 24 for a bar open until 2am)
    if (reservationHour < operatingHours.open) {
      reservationHour += 24;
    }

    const minutesFromOpen =
      (reservationHour - operatingHours.open) * 60 + reservationMinutes;
    const totalOperatingMinutes = (operatingHours.close - operatingHours.open) * 60;

    const clampedMinutes = Math.max(0, Math.min(minutesFromOpen, totalOperatingMinutes));
    // Service type duration is the actual booked slot length; fall back to
    // business.reservationTime (default booking slot) if the service type has none.
    const serviceTypeDuration = serviceTypeMap.get(reservation.serviceTypeId)?.duration;
    const reservationDurationMinutes = serviceTypeDuration ?? business.reservationTime ?? 60;

    return {
      topPx: clampedMinutes,
      // Minimum 30px so very short slots remain readable; 60px/hr → 1px ≈ 1 minute
      heightPx: Math.max(reservationDurationMinutes, 30),
    };
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
            {/* Time labels column — each slot is SLOT_HEIGHT px, matching grid lines */}
            <div className="shrink-0 w-20">
              <div className="border-b border-border" style={{ height: `${HEADER_HEIGHT}px` }} />
              <div
                className="relative"
                style={{ height: `${timeSlots.length * SLOT_HEIGHT}px` }}
              >
                {timeSlots.map((slot, i) => (
                  <div
                    key={slot.actualHour}
                    className="timeline-hour absolute left-0 right-0"
                    style={{ top: `${i * SLOT_HEIGHT}px` }}
                  >
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
                  const gridBodyHeight = timeSlots.length * SLOT_HEIGHT;
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
                        style={{ height: `${gridBodyHeight}px` }}
                      >
                        {/* Hour grid lines — one per slot at i * SLOT_HEIGHT */}
                        {timeSlots.map((slot, i) => (
                          <div
                            key={`${slot.actualHour}`}
                            className="absolute left-0 right-0 border-b border-border"
                            style={{ top: `${i * SLOT_HEIGHT}px` }}
                          />
                        ))}

                        {serviceTypeReservations.map((reservation) => {
                          const position = getEventPositionPx(reservation);
                          const reservationDate = parseISO(reservation.time);
                          const customerInfo = customerMap.get(reservation.customerId);
                          const reservationColor = serviceType.color || "#6b7280";

                          return (
                            <div
                              key={reservation.id}
                              className="timeline-event cursor-pointer border-2"
                              style={{
                                top: `${position.topPx}px`,
                                height: `${position.heightPx}px`,
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
