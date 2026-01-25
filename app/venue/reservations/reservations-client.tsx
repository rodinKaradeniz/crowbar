"use client";

import { useState, useMemo } from "react";
import { ReservationAccordion } from "@/components/reservation-accordion";
import { ReservationSearchFilter } from "@/components/reservation-search-filter";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ReservationDialog } from "@/components/reservation-dialog";
import { Button } from "@/components/ui/button";
import { Pencil, X } from "lucide-react";
import {
  getReservationsByVenueId,
  getTablesByVenueId,
  getCustomerById,
  getReservationTypeByReservation,
} from "@/mock-data";
import { Reservation } from "@/types";

interface ReservationsClientProps {
  venueId: string;
}

export default function ReservationsClient({
  venueId,
}: ReservationsClientProps) {
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);
  const [cancellingReservation, setCancellingReservation] =
    useState<Reservation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const allReservations = getReservationsByVenueId(venueId).filter(
    (r) => r.status === "confirmed"
  );
  const tables = getTablesByVenueId(venueId);

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

  const handleEdit = (reservation: Reservation) => {
    setEditingReservation(reservation);
  };

  const handleCancel = (reservation: Reservation) => {
    setCancellingReservation(reservation);
  };

  const handleSave = async (
    reservation: Omit<Reservation, "createdAt" | "updatedAt">
  ) => {
    // TODO: Implement save logic
    console.log("Save reservation:", reservation);
    setEditingReservation(null);
  };

  const handleCancelConfirm = () => {
    if (cancellingReservation) {
      // TODO: Implement cancel logic
      console.log("Cancel reservation:", cancellingReservation.id);
      setCancellingReservation(null);
    }
  };

  return (
    <div className="page-container">
      <div>
        <h1 className="page-title">Reservations</h1>
        <p className="page-description">
          View confirmed reservations for your venue
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
        emptyMessage="No confirmed reservations found."
        actionButtons={(reservation) => (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(reservation);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleCancel(reservation);
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </>
        )}
      />

      {/* Edit Reservation Dialog */}
      {editingReservation && (
        <ReservationDialog
          reservation={editingReservation}
          open={!!editingReservation}
          onOpenChange={(open) => !open && setEditingReservation(null)}
          onSave={handleSave}
          tables={tables}
          isNew={false}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmationDialog
        open={!!cancellingReservation}
        onOpenChange={(open) => !open && setCancellingReservation(null)}
        title="Cancel Reservation"
        description="Are you sure you want to cancel this reservation? This action cannot be undone."
        confirmLabel="Yes, Cancel"
        cancelLabel="No"
        onConfirm={handleCancelConfirm}
        variant="destructive"
      />
    </div>
  );
}