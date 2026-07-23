"use client";

import { useState, useMemo } from "react";
import { addDays, addMinutes, format, isSameDay, isToday, parseISO } from "date-fns";
import { Clock, Users } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Business, Reservation, ServiceType } from "@/types";
import { UserResponse } from "@/lib/api-client";
import { ReservationDetailsDialog } from "@/components/reservation-details-dialog";
import { cn } from "@/lib/utils";

interface BusinessScheduleClientProps {
  business: Business;
  initialReservations: Reservation[];
  serviceTypes: ServiceType[];
  customers: UserResponse[];
}

/** How many consecutive days the ledger shows, starting at the selected date. */
const LEDGER_DAYS = 3;

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

  // The ledger: selected day + the following days, each with its reservations
  // (sorted by time) and whether the business is closed that day.
  const ledger = useMemo(() => {
    return Array.from({ length: LEDGER_DAYS }, (_, i) => {
      const date = addDays(selectedDate, i);
      const dayName = format(date, "EEEE").toLowerCase();
      const hours = business.operatingHours[dayName];
      const isClosed = !hours || hours.closed === true;
      const reservations = initialReservations
        .filter((r) => isSameDay(parseISO(r.time), date))
        .sort((a, b) => parseISO(a.time).getTime() - parseISO(b.time).getTime());
      return { date, isClosed, reservations };
    });
  }, [initialReservations, selectedDate, business]);

  const handleReservationClick = (reservation: Reservation) => {
    setSelectedReservation(reservation);
  };

  // End time = start + booked slot length (service-type duration, falling
  // back to the business default booking slot).
  const endTimeOf = (reservation: Reservation) => {
    const start = parseISO(reservation.time);
    const duration =
      serviceTypeMap.get(reservation.serviceTypeId)?.duration ??
      business.reservationTime ??
      60;
    return addMinutes(start, duration);
  };

  return (
    <div className="page-pad">
      <div className="mb-8">
        <h1 className="page-title">Schedule</h1>
        <p className="page-description">
          View your daily schedule and reservations
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* ── Left rail: month picker + legend ──────────────────────────── */}
        <aside className="lg:w-72 shrink-0 space-y-6">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            className="rounded-xl bg-card border border-border/40 p-3 w-fit"
          />

          {serviceTypes.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow">Booking types</p>
              {serviceTypes.map((serviceType) => (
                <div key={serviceType.id} className="flex items-center gap-2.5 text-sm">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: serviceType.color }}
                  />
                  <span className="text-muted-foreground">{serviceType.name}</span>
                  <span className="figures text-xs text-muted-foreground/70 ml-auto">
                    cap. {serviceType.capacity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── Day ledger: giant numerals, events beside them ────────────── */}
        <div className="flex-1 min-w-0">
          {ledger.map(({ date, isClosed, reservations }, dayIndex) => (
            <section
              key={date.toISOString()}
              className={cn(
                "grid grid-cols-[6rem_1fr] sm:grid-cols-[10rem_1fr] gap-4 sm:gap-8 py-8",
                dayIndex > 0 && "border-t border-border",
              )}
            >
              {/* Date numeral */}
              <div className="select-none">
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "figures text-6xl sm:text-8xl font-bold leading-none tracking-tighter",
                      isToday(date) ? "text-foreground" : "text-foreground/80",
                    )}
                  >
                    {format(date, "dd")}
                  </span>
                  <span
                    className={cn(
                      "eyebrow mt-2",
                      isToday(date) ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {format(date, "EEE")}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {format(date, "MMMM yyyy")}
                  {isToday(date) && (
                    <span className="ml-1.5 inline-block rounded-full bg-lager px-1.5 py-0.5 text-[10px] font-medium text-porter align-middle">
                      Today
                    </span>
                  )}
                </p>
              </div>

              {/* Events */}
              <div className="min-w-0 space-y-2.5">
                {isClosed ? (
                  <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                    Closed on {format(date, "EEEE")}s
                  </div>
                ) : reservations.length === 0 ? (
                  <div className="rounded-lg bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
                    No reservations yet
                  </div>
                ) : (
                  reservations.map((reservation) => {
                    const start = parseISO(reservation.time);
                    const end = endTimeOf(reservation);
                    const serviceType = serviceTypeMap.get(reservation.serviceTypeId);
                    const customerInfo = customerMap.get(reservation.customerId);
                    const color = serviceType?.color || "#6b7280";

                    return (
                      <button
                        key={reservation.id}
                        onClick={() => handleReservationClick(reservation)}
                        className="w-full text-left rounded-lg bg-card border border-border/40 hover:border-primary/50 transition-colors px-4 py-3 flex items-start gap-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <div className="shrink-0 w-24">
                          <p className="figures text-sm font-semibold">{format(start, "HH:mm")}</p>
                          <p className="figures text-xs text-muted-foreground">–{format(end, "HH:mm")}</p>
                        </div>
                        <span
                          className="w-0.5 self-stretch rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color }}>
                            {serviceType?.name || "Reservation"}
                          </p>
                          <p className="text-sm truncate mt-0.5">
                            {customerInfo?.name || "Unknown"}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="figures inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {reservation.guests}
                            </span>
                            <span className="figures inline-flex items-center gap-1 capitalize">
                              <Clock className="h-3 w-3" />
                              {reservation.status}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </div>
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
