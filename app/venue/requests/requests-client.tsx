"use client";

import { useMemo, useState } from "react";
import { ReservationAccordion } from "@/components/reservation-accordion";
import { ReservationSearchFilter } from "@/components/reservation-search-filter";
import { Button } from "@/components/ui/button";
import {
  getReservationsByVenueId,
  getCustomerById,
  getReservationTypeByReservation,
} from "@/mock-data";
import { Reservation } from "@/types";

interface RequestsClientProps {
  venueId: string;
}

export default function RequestsClient({ venueId }: RequestsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const allReservations = getReservationsByVenueId(venueId).filter(
    (r) => r.status === "pending"
  );

  // Filter reservations based on search, table filter, and type filter
  const reservations = useMemo(() => {
    return allReservations.filter((reservation) => {
      // Search filter
      if (searchQuery) {
        const customer = getCustomerById(reservation.customerId);
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          customer?.name.toLowerCase().includes(searchLower) ||
          customer?.email.toLowerCase().includes(searchLower) ||
          customer?.phone?.toLowerCase().includes(searchLower) ||
          reservation.phone.toLowerCase().includes(searchLower) ||
          reservation.email.toLowerCase().includes(searchLower);

        if (!matchesSearch) return false;
      }

      // Table filter
      if (tableFilter && reservation.tableId !== tableFilter) {
        return false;
      }

      // Type filter - use helper function to get type (handles default types)
      if (typeFilter) {
        const reservationType = getReservationTypeByReservation(reservation);
        if (!reservationType || reservationType.id !== typeFilter) {
          return false;
        }
      }

      return true;
    });
  }, [allReservations, searchQuery, tableFilter, typeFilter]);

  const handleAccept = (reservation: Reservation) => {
    // TODO: Implement accept logic
    console.log("Accept reservation:", reservation.id);
  };

  const handleReject = (reservation: Reservation) => {
    // TODO: Implement reject logic
    console.log("Reject reservation:", reservation.id);
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
        tableFilter={tableFilter}
        onTableFilterChange={setTableFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        venueId={venueId}
        showTableFilter={true}
        showTypeFilter={true}
      />

      <ReservationAccordion
        reservations={reservations}
        emptyMessage="No pending requests found."
        actionButtons={(reservation) => (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={(e) => {
                e.stopPropagation();
                handleAccept(reservation);
              }}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleReject(reservation);
              }}
            >
              Reject
            </Button>
          </>
        )}
      />
    </div>
  );
}