"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Armchair } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FloorPlanSeatingSheet } from "@/components/floor-plan-seating-sheet";
import {
  clientGetFloorPlanBoard,
  clientGetFloorPlanTables,
  clientGetReservationFloorPlanAssignment,
  clientRemoveReservationFloorPlanAssignment,
  clientReplaceFloorPlanAssignment,
} from "@/lib/client-api";
import type { FloorPlanAssignment, FloorPlanBoardTable, FloorPlanParty, Reservation } from "@/types";

interface ReservationTablePlanProps {
  reservation: Reservation;
  guestName?: string | null;
  canOverride: boolean;
}

export function ReservationTablePlan({
  reservation,
  guestName,
  canOverride,
}: ReservationTablePlanProps) {
  const router = useRouter();
  const [tables, setTables] = useState<FloorPlanBoardTable[]>([]);
  const [assignment, setAssignment] = useState<FloorPlanAssignment | null | undefined>();
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const party: FloorPlanParty = {
    sourceType: "reservation",
    sourceId: reservation.id,
    name: guestName || reservation.phone || "Deleted guest",
    partySize: reservation.guests,
    status: reservation.status,
    startsAt: reservation.time,
    assignedTableIds: assignment?.tableIds ?? [],
  };

  const load = async () => {
    setSubmitting(true);
    try {
      const [board, configuredTables] = await Promise.all([
        clientGetFloorPlanBoard(),
        clientGetFloorPlanTables(),
      ]);
      const boardTables = new Map(
        board.areas.flatMap((area) => area.tables).map((table) => [table.id, table]),
      );
      setTables(configuredTables.map((table) => boardTables.get(table.id) ?? {
        id: table.id,
        areaId: table.areaId,
        label: table.label,
        capacity: table.capacity,
        shape: table.shape,
        sortOrder: table.sortOrder,
        displayState: table.operationalState === "ready" ? "available" : table.operationalState,
        operationalState: table.operationalState,
        operationalStateReason: table.operationalStateReason,
        operationalStateUntil: table.operationalStateUntil,
        operationalStateExpired: false,
      }));
      try {
        setAssignment(await clientGetReservationFloorPlanAssignment(reservation.id));
      } catch {
        setAssignment(null);
      }
      setOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load table planning.");
    } finally {
      setSubmitting(false);
    }
  };

  const save = async (tableIds: string[], capacityOverrideReason?: string) => {
    setSubmitting(true);
    try {
      await clientReplaceFloorPlanAssignment({
        sourceType: "reservation",
        sourceId: reservation.id,
        tableIds,
        capacityOverrideReason,
      });
      setAssignment(await clientGetReservationFloorPlanAssignment(reservation.id));
      setOpen(false);
      toast.success("Table plan saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save table plan.");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    setSubmitting(true);
    try {
      await clientRemoveReservationFloorPlanAssignment(reservation.id);
      setAssignment(null);
      setRemoving(false);
      toast.success("Table plan removed");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove table plan.");
    } finally {
      setSubmitting(false);
    }
  };

  if (reservation.status !== "pending" && reservation.status !== "confirmed") return null;

  const labels = assignment?.tableIds
    .map((id) => tables.find((table) => table.id === id)?.label ?? "Table")
    .join(", ");

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
      <div>
        <h4 className="text-sm font-medium">Table plan</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {assignment
            ? `${labels || `${assignment.tableIds.length} table${assignment.tableIds.length === 1 ? "" : "s"}`} planned`
            : assignment === null
              ? "No tables planned yet"
              : "View or set planned tables"}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="filter" variant="secondary" disabled={submitting} onClick={() => void load()}>
          <Armchair /> {assignment ? "Reassign" : "Plan tables"}
        </Button>
        {assignment && (
          <Button size="filter" variant="ghost" disabled={submitting} onClick={() => setRemoving(true)}>
            Remove
          </Button>
        )}
      </div>

      <FloorPlanSeatingSheet
        key={`${reservation.id}-${assignment?.tableIds.join("-") ?? "none"}`}
        open={open}
        onOpenChange={setOpen}
        party={party}
        tables={tables}
        initialTableIds={assignment?.tableIds ?? []}
        canOverride={canOverride}
        mode="assign"
        submitting={submitting}
        onConfirm={(tableIds, reason) => void save(tableIds, reason)}
      />
      <ConfirmationDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove table plan?"
        description="This frees the planned table allocation but does not cancel the reservation."
        confirmLabel="Remove plan"
        variant="destructive"
        onConfirm={() => void remove()}
      />
    </section>
  );
}
