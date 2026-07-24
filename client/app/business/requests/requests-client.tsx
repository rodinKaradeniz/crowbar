"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReservationAccordion } from "@/components/reservation-accordion";
import { ReservationSearchFilter } from "@/components/reservation-search-filter";
import { Button } from "@/components/ui/button";
import { Reservation, ServiceType } from "@/types";
import { CustomerResponse } from "@/lib/api-client";
import { clientUpdateReservation } from "@/lib/client-api";
import { toast } from "sonner";

interface RequestsClientProps {
  businessId: string;
  initialReservations: Reservation[];
  serviceTypes: ServiceType[];
  customers: CustomerResponse[];
  customerSegments?: Record<string, string>;
}

const SEGMENT_HINT: Record<string, { icon: string; color: string }> = {
  Champions: { icon: "⭐", color: "text-green-600 dark:text-green-400" },
  "Loyal Customers": { icon: "💚", color: "text-blue-600 dark:text-blue-400" },
  "Potential Loyalists": { icon: "🌱", color: "text-purple-600 dark:text-purple-400" },
  "At Risk": { icon: "⚠️", color: "text-yellow-600 dark:text-yellow-400" },
  "Lost Customers": { icon: "💤", color: "text-red-600 dark:text-red-400" },
};

export default function RequestsClient({
  businessId,
  initialReservations,
  serviceTypes,
  customers,
  customerSegments,
}: RequestsClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
          reservation.phone.toLowerCase().includes(searchLower) ||
          reservation.email.toLowerCase().includes(searchLower);

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
    <div className="page-container">
      <div>
        <h1 className="page-title">Requests</h1>
        <p className="page-description">
          Review and manage pending reservation requests
        </p>
      </div>

      <ReservationSearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        serviceTypeFilter={serviceTypeFilter}
        onServiceTypeFilterChange={setServiceTypeFilter}
        serviceTypes={serviceTypes}
      />

      <ReservationAccordion
        reservations={reservations}
        serviceTypes={serviceTypes}
        customers={customers}
        emptyMessage="No pending requests found."
        actionButtons={(reservation) => {
          const segment = customerSegments?.[reservation.customerId];
          const hint = segment ? SEGMENT_HINT[segment] : null;

          return (
            <>
              {hint && (
                <span
                  className={`text-xs ${hint.color} whitespace-nowrap`}
                  title={`Customer segment: ${segment}`}
                >
                  {hint.icon} {segment}
                </span>
              )}
              <Button
                size="sm"
                variant="default"
                disabled={actionLoading === reservation.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAccept(reservation);
                }}
              >
                {actionLoading === reservation.id ? "..." : "Accept"}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={actionLoading === reservation.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleReject(reservation);
                }}
              >
                {actionLoading === reservation.id ? "..." : "Reject"}
              </Button>
            </>
          );
        }}
      />
    </div>
  );
}
