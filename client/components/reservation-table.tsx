"use client";

import { useMemo, type ReactNode } from "react";

import { ReservationOverrideNotice } from "@/components/reservation-override-notice";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRegionalSettings } from "@/contexts/regional-context";
import {
  formatBusinessServiceDay,
  formatBusinessTime,
} from "@/lib/business-time";
import type { CustomerResponse } from "@/lib/api-client";
import { bookingLateSeverity, type Severity } from "@/lib/severity";
import type { Reservation, ServiceType } from "@/types";

interface ReservationTableProps {
  reservations: Reservation[];
  serviceTypes?: ServiceType[];
  customers?: CustomerResponse[];
  businessTimezone: string;
  /** Rendered in the last column of each row. Keep it to one or two controls. */
  rowActions?: (reservation: Reservation) => ReactNode;
  onOpen?: (reservation: Reservation) => void;
  emptyMessage?: ReactNode;
  /** Epoch ms from `useServiceClock`, or null before hydration. */
  now?: number | null;
}

/**
 * The reservation book, as a ledger.
 *
 * This replaces an accordion of rounded cards whose details expanded inline.
 * §06: a data table with fixed column widths so font-mono tabular-nums align down the page,
 * hairline separators, no zebra, and **detail belongs in a side panel** — a row
 * that grows to 400px tall pushes everything below it off the screen, which is
 * the opposite of what a book is for.
 *
 * The service-type dot is gone. It was a second status object competing with
 * the badge, and the colour came from a per-tenant hex that no part of the
 * severity system governs. The type is named in words instead.
 *
 * A booking running late is the one attend case here, and it is real. It tints
 * the row and never gets the 2px inset bar — attend is always subordinate, and
 * the bar belongs to critical alone.
 */
export function ReservationTable({
  reservations,
  serviceTypes = [],
  customers = [],
  businessTimezone,
  rowActions,
  onOpen,
  emptyMessage = "No reservations found.",
  now = null,
}: ReservationTableProps) {
  const { locale } = useRegionalSettings();

  const customerMap = useMemo(() => {
    const map = new Map<string, CustomerResponse>();
    customers.forEach((customer) => map.set(customer.id, customer));
    return map;
  }, [customers]);

  const serviceTypeMap = useMemo(() => {
    const map = new Map<string, ServiceType>();
    serviceTypes.forEach((type) => map.set(type.id, type));
    return map;
  }, [serviceTypes]);

  if (reservations.length === 0) {
    return (
      <p className="py-12 text-center text-[length:var(--ui-size)] text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <Table>
      <colgroup>
        <col className="w-[124px]" />
        <col className="w-[80px]" />
        <col />
        <col className="w-[64px]" />
        <col className="w-[132px]" />
        <col className="w-[120px]" />
        {rowActions ? <col className="w-[220px]" /> : null}
      </colgroup>

      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Guest</TableHead>
          <TableHead className="text-right">Party</TableHead>
          <TableHead>Service</TableHead>
          <TableHead>Status</TableHead>
          {rowActions ? <TableHead>{""}</TableHead> : null}
        </TableRow>
      </TableHeader>

      <TableBody>
        {reservations.map((reservation) => {
          const customer = customerMap.get(reservation.customerId);
          const serviceType = serviceTypeMap.get(reservation.serviceTypeId);
          const severity = lateness(reservation, now);

          return (
            <TableRow
              key={reservation.id}
              severity={severity}
              onClick={onOpen ? () => onOpen(reservation) : undefined}
              className={onOpen ? "cursor-pointer" : undefined}
            >
              <TableCell className="font-mono text-[13px] tabular-nums text-muted-foreground">
                {/* Weekday and no year. A book is argued about in weekdays,
                    and the year is never the thing in question. */}
                {formatBusinessServiceDay(
                  reservation.time,
                  businessTimezone,
                  locale,
                )}
              </TableCell>

              <TableCell className="font-mono text-[13px] tabular-nums">
                {formatBusinessTime(reservation.time, businessTimezone, locale)}
              </TableCell>

              <TableCell>
                <span className="font-medium">{customer?.name ?? "Unknown"}</span>
                <ReservationOverrideNotice
                  reservation={reservation}
                  businessTimezone={businessTimezone}
                  compact
                />
                {reservation.note ? (
                  // Neutral. A guest note is information the host needs, not an
                  // alarm — §08 names dietary notes as the case that does not
                  // qualify.
                  <span className="type-micro ml-2.5 text-muted-foreground">
                    Note
                  </span>
                ) : null}
              </TableCell>

              <TableCell numeric>{reservation.guests}</TableCell>

              <TableCell className="truncate text-muted-foreground">
                {serviceType?.name ?? "—"}
              </TableCell>

              <TableCell>
                {severity === "attend" ? (
                  <Badge tone="attend">Late</Badge>
                ) : (
                  <Badge tone="neutral">{reservation.status}</Badge>
                )}
              </TableCell>

              {rowActions ? (
                <TableCell
                  onClick={(event) => event.stopPropagation()}
                  className="text-right"
                >
                  <span className="flex justify-end gap-2">
                    {rowActions(reservation)}
                  </span>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Attend when a booking that has not arrived is past its time.
 *
 * Returns neutral until the client clock is available: the server cannot know
 * "now", and a badge that flips on hydration is worse than one that appears.
 */
function lateness(reservation: Reservation, now: number | null): Severity {
  if (now === null) return "neutral";
  if (reservation.status !== "confirmed" && reservation.status !== "pending") {
    return "neutral";
  }
  const minutesLate = Math.floor(
    (now - new Date(reservation.time).getTime()) / 60_000,
  );
  return bookingLateSeverity(minutesLate);
}
