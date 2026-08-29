"use client";

import type { ReactNode } from "react";

import { ReservationOverrideNotice } from "@/components/reservation-override-notice";
import { Badge } from "@/components/ui/badge";
import { Figure } from "@/components/ui/figure";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRegionalSettings } from "@/contexts/regional-context";
import {
  formatBusinessDate,
  formatBusinessDateTime,
  formatBusinessTime,
} from "@/lib/business-time";
import type { CustomerResponse } from "@/lib/api-client";
import type { Reservation, ServiceType } from "@/types";

/**
 * One booking, in the side panel — §06's fixed structure:
 * header (kind + name + close) → two-cell figure band → definition list →
 * history → actions in a bordered footer.
 *
 * 400px, right edge, E1, 180ms. Click-outside and Esc close it, and it never
 * takes the screen away from the book behind it — which is the whole reason
 * detail moved out of an inline accordion.
 */
export function ReservationPanel({
  reservation,
  customer,
  serviceType,
  businessTimezone,
  open,
  onOpenChange,
  actions,
  tablePlan,
}: {
  reservation: Reservation | null;
  customer?: CustomerResponse;
  serviceType?: ServiceType;
  businessTimezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The controls that change this booking. Rendered in the bordered footer. */
  actions?: ReactNode;
  /** Table assignment, which is its own decision and gets its own block. */
  tablePlan?: ReactNode;
}) {
  const { locale } = useRegionalSettings();
  if (!reservation) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <p className="type-label text-muted-foreground">Booking</p>
          <SheetTitle>{customer?.name ?? "Unknown guest"}</SheetTitle>
          <SheetDescription>
            {formatBusinessDate(reservation.time, businessTimezone, locale)} ·{" "}
            {formatBusinessTime(reservation.time, businessTimezone, locale)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* The two-cell figure band. */}
          <div className="grid grid-cols-2 border-b border-border">
            <div className="border-r border-border p-4">
              <Figure label="Party" value={reservation.guests} />
            </div>
            <div className="p-4">
              <Figure
                label="Status"
                value={<Badge tone="neutral">{reservation.status}</Badge>}
              />
            </div>
          </div>

          <DefinitionList
            rows={[
              ["Service", serviceType?.name],
              ["Email", customer?.email],
              ["Phone", customer?.phone ?? reservation.phone],
              ["Note", reservation.note],
            ]}
          />

          <div className="border-b border-border px-4 py-3">
            <ReservationOverrideNotice
              reservation={reservation}
              businessTimezone={businessTimezone}
            />
          </div>

          {tablePlan ? (
            <div className="border-b border-border px-4 py-4">
              <p className="type-micro mb-3 text-muted-foreground">Table</p>
              {tablePlan}
            </div>
          ) : null}

          <div className="px-4 py-4">
            <p className="type-micro mb-3 text-muted-foreground">History</p>
            <DefinitionRow
              term="Booked"
              detail={formatBusinessDateTime(
                reservation.createdAt,
                businessTimezone,
                locale,
              )}
            />
            {reservation.updatedAt !== reservation.createdAt ? (
              <DefinitionRow
                term="Changed"
                detail={formatBusinessDateTime(
                  reservation.updatedAt,
                  businessTimezone,
                  locale,
                )}
              />
            ) : null}
          </div>
        </div>

        {actions ? (
          <SheetFooter>
            <div className="flex flex-wrap gap-2">{actions}</div>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DefinitionList({ rows }: { rows: [string, ReactNode][] }) {
  const present = rows.filter(([, value]) => Boolean(value));
  if (present.length === 0) return null;

  return (
    <dl className="border-b border-border px-4 py-2">
      {present.map(([term, detail]) => (
        <DefinitionRow key={term} term={term} detail={detail} />
      ))}
    </dl>
  );
}

function DefinitionRow({ term, detail }: { term: string; detail: ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-surface-3 py-2.5 last:border-0">
      <dt className="type-label w-[88px] shrink-0 pt-0.5 text-muted-foreground">
        {term}
      </dt>
      <dd className="m-0 min-w-0 flex-1 text-[length:var(--ui-size)] break-words">
        {detail}
      </dd>
    </div>
  );
}
