"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ReservationAccordion } from "@/components/reservation-accordion";
import { ReservationSearchFilter } from "@/components/reservation-search-filter";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  ReservationEditDialog,
  type ReservationEditValues,
} from "@/components/reservation-edit-dialog";
import { StaffReservationDialog } from "@/components/staff-reservation-dialog";
import { Button } from "@/components/ui/button";
import { CalendarClock, Pencil, Plus, X } from "lucide-react";
import { Reservation, ServiceType } from "@/types";
import { CustomerResponse } from "@/lib/api-client";
import { clientUpdateReservation } from "@/lib/client-api";
import { toast } from "sonner";
import { isReservationReschedulable } from "@/lib/availability";

interface ReservationsClientProps {
  initialReservations: Reservation[];
  serviceTypes: ServiceType[];
  customers: CustomerResponse[];
  businessTimezone: string;
  businessMaxGuests: number;
  currentTime: string;
  canOverride: boolean;
}

export default function ReservationsClient({
  initialReservations,
  serviceTypes,
  customers,
  businessTimezone,
  businessMaxGuests,
  currentTime,
  canOverride,
}: ReservationsClientProps) {
  const router = useRouter();
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);
  const [reschedulingReservation, setReschedulingReservation] =
    useState<Reservation | null>(null);
  const [creatingReservation, setCreatingReservation] = useState(false);
  const [cancellingReservation, setCancellingReservation] =
    useState<Reservation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Build a lookup map for customers
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

  const handleEdit = (reservation: Reservation) => {
    setEditingReservation(reservation);
  };

  const handleCancel = (reservation: Reservation) => {
    setCancellingReservation(reservation);
  };

  const handleSave = async (values: ReservationEditValues) => {
    if (!editingReservation) return;
    setActionLoading(editingReservation.id);
    try {
      await clientUpdateReservation(editingReservation.id, values);
      toast.success("Reservation updated");
      setEditingReservation(null);
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelConfirm = async () => {
    if (cancellingReservation) {
      setActionLoading(cancellingReservation.id);
      try {
        await clientUpdateReservation(cancellingReservation.id, {
          status: "cancelled",
        });
        toast.success("Reservation cancelled");
        setCancellingReservation(null);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to cancel reservation");
      } finally {
        setActionLoading(null);
      }
    }
  };

  return (
    <div className="page-container">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Reservations</h1>
          <p className="page-description">
            View confirmed reservations for your business
          </p>
        </div>
        <Button type="button" onClick={() => setCreatingReservation(true)}>
          <Plus /> New reservation
        </Button>
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
        emptyMessage="No confirmed reservations found."
        actionButtons={(reservation) => (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={actionLoading === reservation.id}
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(reservation);
              }}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
            {isReservationReschedulable(reservation, currentTime) && (
              <Button
                size="sm"
                variant="outline"
                disabled={actionLoading === reservation.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setReschedulingReservation(reservation);
                }}
              >
                <CalendarClock className="h-4 w-4 mr-1" />
                Reschedule
              </Button>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={actionLoading === reservation.id}
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
        <ReservationEditDialog
          reservation={editingReservation}
          open={!!editingReservation}
          onOpenChange={(open) => !open && setEditingReservation(null)}
          onSave={handleSave}
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

      <StaffReservationDialog
        reservation={null}
        open={creatingReservation}
        onOpenChange={setCreatingReservation}
        serviceTypes={serviceTypes}
        businessTimezone={businessTimezone}
        businessMaxGuests={businessMaxGuests}
        canOverride={canOverride}
        mode="create"
        onCompleted={() => {
          setCreatingReservation(false);
          router.refresh();
        }}
      />

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
