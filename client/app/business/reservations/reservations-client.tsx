"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ReservationAccordion } from "@/components/reservation-accordion";
import { ReservationSearchFilter } from "@/components/reservation-search-filter";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { ReservationDialog } from "@/components/reservation-dialog";
import { Button } from "@/components/ui/button";
import { Pencil, X } from "lucide-react";
import { Reservation, ServiceType } from "@/types";
import { UserResponse } from "@/lib/api-client";
import { clientUpdateReservation } from "@/lib/client-api";
import { toast } from "sonner";

interface ReservationsClientProps {
  businessId: string;
  initialReservations: Reservation[];
  serviceTypes: ServiceType[];
  customers: UserResponse[];
}

export default function ReservationsClient({
  businessId,
  initialReservations,
  serviceTypes,
  customers,
}: ReservationsClientProps) {
  const router = useRouter();
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);
  const [cancellingReservation, setCancellingReservation] =
    useState<Reservation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Build a lookup map for customers
  const customerMap = useMemo(() => {
    const map = new Map<string, UserResponse>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  // Build a lookup map for service types
  const serviceTypeMap = useMemo(() => {
    const map = new Map<string, ServiceType>();
    serviceTypes.forEach((st) => map.set(st.id, st));
    return map;
  }, [serviceTypes]);

  // Filter reservations based on search and service type filter
  const reservations = useMemo(() => {
    return initialReservations.filter((reservation) => {
      // Search filter
      if (searchQuery) {
        const customer = customerMap.get(reservation.customerId);
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          customer?.name.toLowerCase().includes(searchLower) ||
          customer?.email.toLowerCase().includes(searchLower) ||
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

  const handleSave = async (
    reservation: Omit<Reservation, "createdAt" | "updatedAt">
  ) => {
    setIsSaving(true);
    try {
      await clientUpdateReservation(reservation.id, {
        serviceTypeId: reservation.serviceTypeId,
        time: reservation.time,
        phone: reservation.phone,
        email: reservation.email,
        note: reservation.note,
        status: reservation.status,
        guests: reservation.guests,
      });
      toast.success("Reservation updated");
      setEditingReservation(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save reservation");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (cancellingReservation) {
      setIsSaving(true);
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
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="page-container">
      <div>
        <h1 className="page-title">Reservations</h1>
        <p className="page-description">
          View confirmed reservations for your business
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
          serviceTypes={serviceTypes}
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
