"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { ReservationTable } from "@/components/reservation-table";
import { Badge } from "@/components/ui/badge";
import { ReservationSearchFilter } from "@/components/reservation-search-filter";
import { Button } from "@/components/ui/button";
import { StaffReservationDialog } from "@/components/staff-reservation-dialog";
import { Reservation, ServiceType } from "@/types";
import { CustomerResponse } from "@/lib/api-client";
import { clientUpdateReservation } from "@/lib/client-api";
import { toast } from "sonner";
import { isReservationReschedulable } from "@/lib/availability";

interface RequestsClientProps {
  initialReservations: Reservation[];
  serviceTypes: ServiceType[];
  customers: CustomerResponse[];
  customerSegments?: Record<string, string>;
  businessTimezone: string;
  businessMaxGuests: number;
  currentTime: string;
  canOverride: boolean;
}

/**
 * Guest segments used to render as emoji in five different colours — green,
 * blue, purple, yellow, red. That is a categorical palette the token file does
 * not declare, a second status object competing with the badge, and colour
 * standing in for words.
 *
 * More to the point, a guest's segment is NEUTRAL under the rank: how often
 * someone visits is not something to handle before the night ends, and "At
 * Risk" in amber next to a genuinely late booking would make the two look
 * equally urgent. The segment is named, in the one badge form.
 */

export default function RequestsClient({
  initialReservations,
  serviceTypes,
  customers,
  customerSegments,
  businessTimezone,
  businessMaxGuests,
  currentTime,
  canOverride,
}: RequestsClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reschedulingReservation, setReschedulingReservation] =
    useState<Reservation | null>(null);

  const customerMap = useMemo(() => {
    const map = new Map<string, CustomerResponse>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  // Filter reservations based on search and service type filter
  const reservations = useMemo(() => {
    return initialReservations.filter((reservation) => {
      // Search filter
      if (searchQuery) {
        const customer = customerMap.get(reservation.customerId);
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          customer?.name?.toLowerCase().includes(searchLower) ||
          customer?.email?.toLowerCase().includes(searchLower) ||
          customer?.phone?.toLowerCase().includes(searchLower) ||
          reservation.phone?.toLowerCase().includes(searchLower) ||
          reservation.email?.toLowerCase().includes(searchLower);

        if (!matchesSearch) return false;
      }

      // Service type filter
      if (serviceTypeFilter && reservation.serviceTypeId !== serviceTypeFilter) {
        return false;
      }

      return true;
    });
  }, [initialReservations, searchQuery, serviceTypeFilter, customerMap]);

  const handleAccept = async (reservation: Reservation) => {
    setActionLoading(reservation.id);
    try {
      await clientUpdateReservation(reservation.id, { status: "confirmed" });
      toast.success("Reservation accepted");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept reservation");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reservation: Reservation) => {
    setActionLoading(reservation.id);
    try {
      await clientUpdateReservation(reservation.id, { status: "cancelled" });
      toast.success("Reservation rejected");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject reservation");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 px-[clamp(16px,2.5vw,32px)] py-6">
      <div>
        <h1 className="type-t1">Requests</h1>
        <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">
          Bookings waiting on a yes or a no.
        </p>
      </div>

      <ReservationSearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        serviceTypeFilter={serviceTypeFilter}
        onServiceTypeFilterChange={setServiceTypeFilter}
        serviceTypes={serviceTypes}
      />

      {initialReservations.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="When a guest asks for a time you have set as request-only, it lands here for someone to accept."
          action={{ label: "Booking settings", href: "/business/profile/booking" }}
        />
      ) : (
        <ReservationTable
          reservations={reservations}
          serviceTypes={serviceTypes}
          customers={customers}
          businessTimezone={businessTimezone}
          emptyMessage="Nothing matches that search."
          rowActions={(reservation) => {
            const segment = customerSegments?.[reservation.customerId];

            return (
              <>
                {segment ? <Badge tone="neutral">{segment}</Badge> : null}
                {isReservationReschedulable(reservation, currentTime) ? (
                  <Button
                    size="filter"
                    variant="secondary"
                    disabled={actionLoading === reservation.id}
                    onClick={() => setReschedulingReservation(reservation)}
                  >
                    Move
                  </Button>
                ) : null}
                <Button
                  size="filter"
                  disabled={actionLoading === reservation.id}
                  onClick={() => handleAccept(reservation)}
                >
                  Accept
                </Button>
                {/* Declining a request is routine. The item is not in trouble. */}
                <Button
                  size="filter"
                  variant="secondary"
                  disabled={actionLoading === reservation.id}
                  onClick={() => handleReject(reservation)}
                >
                  Decline
                </Button>
              </>
            );
          }}
        />
      )}

      <StaffReservationDialog
        reservation={reschedulingReservation}
        open={!!reschedulingReservation}
        onOpenChange={(open) => !open && setReschedulingReservation(null)}
        serviceTypes={serviceTypes}
        businessTimezone={businessTimezone}
        businessMaxGuests={businessMaxGuests}
        canOverride={canOverride}
        mode="reschedule"
        onCompleted={() => {
          setReschedulingReservation(null);
          router.refresh();
        }}
      />
    </div>
  );
}
