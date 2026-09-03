"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { ReservationPanel } from "@/components/reservation-panel";
import { ReservationTable } from "@/components/reservation-table";
import { ReservationSearchFilter } from "@/components/reservation-search-filter";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  ReservationEditDialog,
  type ReservationEditValues,
} from "@/components/reservation-edit-dialog";
import { StaffReservationDialog } from "@/components/staff-reservation-dialog";
import { ReservationTablePlan } from "@/components/reservation-table-plan";
import { ReservationWaitlistPanel } from "@/components/reservation-waitlist-panel";
import { Button } from "@/components/ui/button";
import { useServiceClock } from "@/hooks/use-service-clock";
import type { Reservation, ReservationWaitlistEntry, ServiceType } from "@/types";
import { CustomerResponse } from "@/lib/api-client";
import { clientMarkReservationNoShow, clientUpdateReservation } from "@/lib/client-api";
import { toast } from "sonner";
import { isReservationReschedulable } from "@/lib/availability";
import { PageBody, PageHeader } from "@/components/page-header";

interface ReservationsClientProps {
  initialReservations: Reservation[];
  initialWaitlistEntries: ReservationWaitlistEntry[];
  businessId: string;
  serviceTypes: ServiceType[];
  customers: CustomerResponse[];
  businessTimezone: string;
  businessMaxGuests: number;
  currentTime: string;
  canOverride: boolean;
}

export default function ReservationsClient({
  initialReservations,
  initialWaitlistEntries,
  businessId,
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
  const [noShowReservation, setNoShowReservation] = useState<Reservation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [openReservation, setOpenReservation] = useState<Reservation | null>(null);
  const { now, ready } = useServiceClock();

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

  const handleNoShowConfirm = async () => {
    if (!noShowReservation) return;
    setActionLoading(noShowReservation.id);
    try {
      await clientMarkReservationNoShow(noShowReservation.id);
      toast.success("Reservation marked as no-show");
      setNoShowReservation(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark this reservation as no-show");
    } finally {
      setActionLoading(null);
    }
  };

  const serviceTypeMap = useMemo(() => {
    const map = new Map<string, ServiceType>();
    serviceTypes.forEach((type) => map.set(type.id, type));
    return map;
  }, [serviceTypes]);

  const panelReservation = openReservation
    ? (reservations.find((item) => item.id === openReservation.id) ??
      openReservation)
    : null;

  return (
    <>
      <PageHeader
        wide
        title="Reservations"
        description="The book, for every device and every shift."
        actions={
          <Button type="button" onClick={() => setCreatingReservation(true)}>
            New reservation
          </Button>
        }
      >
        <ReservationSearchFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          serviceTypeFilter={serviceTypeFilter}
          onServiceTypeFilterChange={setServiceTypeFilter}
          serviceTypes={serviceTypes}
        />
      </PageHeader>

      <PageBody wide>

        {initialReservations.length === 0 ? (
          <EmptyState
            title="Nothing on the book"
            description="Bookings from your public page and from staff land here on one schedule, kept by everyone at once."
            action={{
              label: "Take a booking",
              onClick: () => setCreatingReservation(true),
            }}
          />
        ) : (
          <ReservationTable
            reservations={reservations}
            serviceTypes={serviceTypes}
            customers={customers}
            businessTimezone={businessTimezone}
            now={ready ? now : null}
            onOpen={setOpenReservation}
            emptyMessage="Nothing matches that search."
            rowActions={(reservation) => (
              <>
                <Button
                  size="filter"
                  variant="secondary"
                  disabled={actionLoading === reservation.id}
                  onClick={() => handleEdit(reservation)}
                >
                  Edit
                </Button>
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
                {/* Not destructive. Cancelling a booking is routine work; the
                    red belongs on the confirmation, not on every row. */}
                <Button
                  size="filter"
                  variant="secondary"
                  disabled={actionLoading === reservation.id}
                  onClick={() => handleCancel(reservation)}
                >
                  Cancel
                </Button>
              </>
            )}
          />
        )}

        <ReservationPanel
          reservation={panelReservation}
          customer={
            panelReservation
              ? customerMap.get(panelReservation.customerId)
              : undefined
          }
          serviceType={
            panelReservation
              ? serviceTypeMap.get(panelReservation.serviceTypeId)
              : undefined
          }
          businessTimezone={businessTimezone}
          open={panelReservation !== null}
          onOpenChange={(open) => !open && setOpenReservation(null)}
          tablePlan={
            panelReservation ? (
              <ReservationTablePlan
                reservation={panelReservation}
                guestName={customerMap.get(panelReservation.customerId)?.name}
                canOverride={canOverride}
              />
            ) : null
          }
          actions={
            panelReservation ? (
              <>
                <Button
                  size="filter"
                  onClick={() => handleEdit(panelReservation)}
                >
                  Edit
                </Button>
                {panelReservation.status === "pending" ||
                panelReservation.status === "confirmed" ? (
                  <Button
                    size="filter"
                    variant="secondary"
                    onClick={() => setNoShowReservation(panelReservation)}
                  >
                    No-show
                  </Button>
                ) : null}
                <Button
                  size="filter"
                  variant="destructive-quiet"
                  onClick={() => handleCancel(panelReservation)}
                >
                  Cancel booking
                </Button>
              </>
            ) : null
          }
        />

        <ReservationWaitlistPanel
          initialEntries={initialWaitlistEntries}
          businessId={businessId}
          businessTimezone={businessTimezone}
          businessMaxGuests={businessMaxGuests}
          serviceTypes={serviceTypes}
          customers={customers}
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
        <ConfirmationDialog
          open={noShowReservation !== null}
          onOpenChange={(open) => !open && setNoShowReservation(null)}
          title="Mark as no-show?"
          description={`This is available after the venue's arrival grace period and immediately releases ${noShowReservation?.guests ?? 1} covers back to availability.`}
          confirmLabel="Mark no-show"
          variant="destructive"
          onConfirm={() => void handleNoShowConfirm()}
        />

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
      </PageBody>
    </>
  );
}
