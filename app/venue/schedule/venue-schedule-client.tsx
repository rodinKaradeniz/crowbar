"use client";

import { useState, useMemo } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { Calendar as CalendarIcon, Clock, Users, MapPin, Tag } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getReservationsByVenueId,
  getVenueById,
  getTablesByVenueId,
  getCustomerById,
  getReservationTypesByVenueId,
  getReservationTypeByReservation,
} from "@/mock-data";
import { Reservation } from "@/types";
import { cn } from "@/lib/utils";
import { ReservationDetailsDialog } from "@/components/reservation-details-dialog";

interface VenueScheduleClientProps {
  venueId: string;
}

export default function VenueScheduleClient({
  venueId,
}: VenueScheduleClientProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  const venue = getVenueById(venueId);
  const allReservations = getReservationsByVenueId(venueId);
  const tables = getTablesByVenueId(venueId);
  const reservationTypes = getReservationTypesByVenueId(venueId);

  console.log("Venue:", venue?.id, venue?.name);
  console.log("Tables count:", tables.length);
  console.log(
    "Tables:",
    tables.map((t) => ({ id: t.id, number: t.number }))
  );
  console.log("All reservations count:", allReservations.length);

  // Filter reservations for selected date
  const dayReservations = useMemo(() => {
    console.log(
      "Filtering reservations for date:",
      format(selectedDate, "yyyy-MM-dd")
    );
    const filtered = allReservations.filter((reservation) => {
      const reservationDate = parseISO(reservation.time);
      const isMatch = isSameDay(reservationDate, selectedDate);

      // Debug for Dec 27-28 reservations
      if (
        reservation.time.includes("2025-12-27") ||
        reservation.time.includes("2025-12-28")
      ) {
        console.log("Dec 27-28 reservation check:", {
          id: reservation.id,
          time: reservation.time,
          parsedDate: reservationDate,
          parsedLocalDate: format(reservationDate, "yyyy-MM-dd HH:mm"),
          selectedDate: format(selectedDate, "yyyy-MM-dd"),
          isMatch,
        });
      }

      return isMatch;
    });

    console.log("dayReservations count:", filtered.length);
    console.log(
      "dayReservations:",
      filtered.map((r) => ({
        id: r.id,
        time: r.time,
        tableId: r.tableId,
      }))
    );

    return filtered;
  }, [allReservations, selectedDate]);

  // Get operating hours for the selected day
  const operatingHours = useMemo(() => {
    if (!venue) return { open: 9, close: 22 };
    const dayName = format(selectedDate, "EEEE").toLowerCase();
    const hours = venue.operatingHours[dayName];
    if (!hours || hours.closed === true) return null;

    // TypeScript now knows hours has open and close
    const [openHour] = hours.open.split(":").map(Number);
    let [closeHour] = hours.close.split(":").map(Number);

    // Handle overnight hours (e.g., 9 AM to 3 AM next day)
    // If close < open, it means it closes the next day
    if (closeHour < openHour) {
      closeHour += 24; // Add 24 to represent next day
    }

    return { open: openHour, close: closeHour };
  }, [venue, selectedDate]);

    // Generate time slots - store both display hour and actual hour
    const timeSlots = useMemo(() => {
      if (!operatingHours) return [];
      const slots: Array<{ displayHour: number; actualHour: number }> = [];
  
      // Generate slots from open to close
      for (let hour = operatingHours.open; hour <= operatingHours.close; hour++) {
        slots.push({
          displayHour: hour % 24, // For display (0-23)
          actualHour: hour, // Actual hour value for calculations
        });
      }
  
      return slots;
    }, [operatingHours]);
  
    // Calculate position for timeline events
    const getEventPosition = (reservation: Reservation) => {
      if (!operatingHours) return { top: 0, height: 0 };
      const reservationDate = parseISO(reservation.time);
      
      // Get local time components
      const reservationHour = reservationDate.getHours();
      const reservationMinutes = reservationDate.getMinutes();
      
      // Convert reservation time to minutes from midnight
      const reservationTotalMinutes = reservationHour * 60 + reservationMinutes;
      
      // Convert operating hours to minutes from midnight
      const openTotalMinutes = operatingHours.open * 60;
      let closeTotalMinutes = operatingHours.close * 60;
      
      // Handle overnight (if close hour is next day, e.g., close = 27 means 3 AM next day)
      if (operatingHours.close > 24) {
        closeTotalMinutes = (operatingHours.close - 24) * 60 + 24 * 60; // Next day portion
      } else if (operatingHours.close < operatingHours.open) {
        // Close is earlier than open means it's next day (e.g., 9 AM to 3 AM)
        closeTotalMinutes = operatingHours.close * 60 + 24 * 60;
      }
      
      // Calculate total operating time range in minutes
      const totalOperatingMinutes = closeTotalMinutes - openTotalMinutes;
      
      // Calculate minutes from start of operating hours
      let minutesFromStart = reservationTotalMinutes - openTotalMinutes;
      
      // Handle reservations that are in the "next day" portion of overnight hours
      // (e.g., reservation at 1 AM when open is 9 AM, close is 3 AM next day)
      if (minutesFromStart < 0 && (operatingHours.close > 24 || operatingHours.close < operatingHours.open)) {
        minutesFromStart += 24 * 60; // Add 24 hours
      }
      
      // Ensure we're within bounds
      minutesFromStart = Math.max(0, Math.min(minutesFromStart, totalOperatingMinutes));
      
      // Calculate percentage from top (0% = open hour, 100% = close hour)
      const topPercent = totalOperatingMinutes > 0 ? (minutesFromStart / totalOperatingMinutes) * 100 : 0;
      
      // Calculate height as percentage of operating time
      const reservationDurationMinutes = venue?.reservationTime || 60;
      const heightPercent = totalOperatingMinutes > 0 
        ? (reservationDurationMinutes / totalOperatingMinutes) * 100 
        : 0;
      
      return { 
        top: topPercent, 
        height: Math.max(heightPercent, 1) // Minimum 1% height for visibility
      };
    };
  
    // Helper to calculate time marker position
    const getTimeMarkerPosition = (actualHour: number) => {
      if (!operatingHours) return 0;
      
      const hourTotalMinutes = actualHour * 60;
      const openTotalMinutes = operatingHours.open * 60;
      let closeTotalMinutes = operatingHours.close * 60;
      
      // Handle overnight
      if (operatingHours.close > 24) {
        closeTotalMinutes = (operatingHours.close - 24) * 60 + 24 * 60;
      } else if (operatingHours.close < operatingHours.open) {
        closeTotalMinutes = operatingHours.close * 60 + 24 * 60;
      }
      
      const totalOperatingMinutes = closeTotalMinutes - openTotalMinutes;
      const minutesFromStart = hourTotalMinutes - openTotalMinutes;
      
      // Handle overnight hours
      let adjustedMinutesFromStart = minutesFromStart;
      if (minutesFromStart < 0 && (operatingHours.close > 24 || operatingHours.close < operatingHours.open)) {
        adjustedMinutesFromStart += 24 * 60;
      }
      
      return totalOperatingMinutes > 0 
        ? (adjustedMinutesFromStart / totalOperatingMinutes) * 100 
        : 0;
    };

  // Get reservations for a specific table
  const getReservationsForTable = (tableId: string) => {
    return dayReservations.filter((r) => r.tableId === tableId);
  };

  const handleReservationClick = (reservation: Reservation) => {
    setSelectedReservation(reservation);
  };

  // Get color for reservation based on type
  const getReservationColor = (reservation: Reservation) => {
    const reservationType = getReservationTypeByReservation(reservation);
    if (reservationType) {
      return reservationType.color;
    }
    // Fallback to status-based color if no type found
    return "bg-muted border-muted-foreground/20";
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
        {reservationTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Tag className="h-4 w-4" />
              <span>Reservation Types:</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {reservationTypes.map((type) => (
                <div
                  key={type.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: type.color }}
                  />
                  <span className="text-muted-foreground">{type.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="timeline-container">
        {dayReservations.length === 0 && tables.length === 0 ? (
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
              <div className="h-12 border-b border-border" />{" "}
              {/* Header spacer */}
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

            {/* Table columns */}
            <div className="flex-1 overflow-x-auto">
              <div
                className="timeline-grid"
                style={{
                  gridTemplateColumns: `repeat(${tables.length}, minmax(200px, 1fr))`,
                }}
              >
                {tables.map((table) => {
                  const tableReservations = getReservationsForTable(table.id);
                  return (
                    <div key={table.id} className="timeline-column">
                      {/* Table header */}
                      <div className="timeline-column-header">
                        <div className="font-medium">{table.number}</div>
                        <div className="text-xs text-muted-foreground">
                          Capacity: {table.capacity}
                        </div>
                      </div>

                      {/* Timeline grid for this table */}
                      <div
                        className="relative"
                        style={{ 
                          height: '100%',
                          minHeight: `${timeSlots.length * 60}px` 
                        }}
                      >
                        {/* Time markers */}
                        <div className="absolute inset-0">
                          {timeSlots.map((slot) => {
                            const positionPercent = getTimeMarkerPosition(slot.actualHour);

                            return (
                              <div
                                key={`${slot.actualHour}`}
                                className="absolute left-0 right-0 border-b border-border"
                                style={{
                                  top: `${positionPercent}%`,
                                }}
                              />
                            );
                          })}
                        </div>

                        {/* Reservations for this table */}
                        {tableReservations.map((reservation) => {
                          const position = getEventPosition(reservation);
                          const reservationDate = parseISO(reservation.time);
                          const customerInfo = getCustomerById(
                            reservation.customerId
                          );
                          const reservationType = getReservationTypeByReservation(reservation);
                          const reservationColor = reservationType?.color || "#6b7280"; // Fallback gray

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
                              backgroundColor: `${reservationColor}20`, // 20 = opacity
                              borderColor: reservationColor,
                              color: reservationColor,
                            }}
                            onClick={() =>
                              handleReservationClick(reservation)
                            }
                          >
                            <div className="flex items-center gap-2 text-sm overflow-hidden whitespace-nowrap h-full p-2">
                              <div className="font-medium truncate">
                                {customerInfo?.name || "Unknown"}
                              </div>
                              {reservationType && (
                                <>
                                  <span className="opacity-60">•</span>
                                  <div className="flex items-center gap-1 opacity-80">
                                    <div
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: reservationColor }}
                                    />
                                    <span className="text-xs truncate">{reservationType.name}</span>
                                  </div>
                                </>
                              )}
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
      />
    </div>
  );
}