"use client";

import { useMemo, useState } from "react";
import { Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { FloorPlanBoardTable, FloorPlanParty } from "@/types";
import { cn } from "@/lib/utils";

interface FloorPlanSeatingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  party: FloorPlanParty | null;
  tables: FloorPlanBoardTable[];
  initialTableIds?: string[];
  canOverride: boolean;
  mode?: "seat" | "assign";
  submitting?: boolean;
  onConfirm: (tableIds: string[], capacityOverrideReason?: string) => void;
}

export function FloorPlanSeatingSheet({
  open,
  onOpenChange,
  party,
  tables,
  initialTableIds,
  canOverride,
  mode = "seat",
  submitting = false,
  onConfirm,
}: FloorPlanSeatingSheetProps) {
  const defaultIds = initialTableIds ?? party?.assignedTableIds ?? [];
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultIds);
  const [reason, setReason] = useState("");

  const selectedTables = useMemo(
    () => tables.filter((table) => selectedIds.includes(table.id)),
    [selectedIds, tables],
  );
  const selectedCapacity = selectedTables.reduce((total, table) => total + table.capacity, 0);
  const needsOverride = Boolean(party && selectedCapacity < party.partySize);

  const isSelectable = (table: FloorPlanBoardTable) => {
    if (initialTableIds?.includes(table.id)) return true;
    if (mode === "assign") return table.operationalState !== "out_of_service";
    if (table.operationalState !== "ready") return false;
    if (table.displayState === "available") return true;
    return table.activeAssignment?.sourceId === party?.sourceId;
  };

  const toggleTable = (table: FloorPlanBoardTable) => {
    if (!isSelectable(table)) return;
    setSelectedIds((current) =>
      current.includes(table.id)
        ? current.filter((id) => id !== table.id)
        : [...current, table.id],
    );
  };

  const validReason = !needsOverride || (canOverride && reason.trim().length >= 10);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{mode === "seat" ? "Seat party" : "Assign tables"}</SheetTitle>
          <SheetDescription>
            {party ? `${party.name} · party of ${party.partySize}` : "Choose a party and tables."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-4 pb-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4" /> Selected capacity
            </span>
            <span className="figures font-semibold">{selectedCapacity} / {party?.partySize ?? 0}</span>
          </div>

          <div>
            <p className="eyebrow mb-2">Ready tables</p>
            {tables.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground">
                No tables are configured yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {tables.map((table) => {
                  const selected = selectedIds.includes(table.id);
                  const selectable = isSelectable(table);
                  return (
                    <button
                      key={table.id}
                      type="button"
                      disabled={!selectable}
                      onClick={() => toggleTable(table)}
                      className={cn(
                        "relative rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        selected && "border-primary bg-primary/10",
                        selectable && !selected && "hover:border-primary/50",
                        !selectable && "cursor-not-allowed border-border/50 bg-muted/40 text-muted-foreground opacity-70",
                      )}
                    >
                      {selected && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
                      <p className="font-medium">{table.label}</p>
                      <p className="figures text-xs text-muted-foreground">{table.capacity} seats</p>
                      {!selectable && <p className="mt-1 text-[10px] capitalize">{table.displayState.replaceAll("_", " ")}</p>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {needsOverride && (
            <div className="space-y-2 border-l-2 border-border-strong bg-secondary p-3">
              <p className="text-sm font-medium">Selected tables seat fewer guests than this party.</p>
              {canOverride ? (
                <>
                  <label htmlFor="capacity-override-reason" className="text-xs text-muted-foreground">
                    Owner or manager reason (at least 10 characters)
                  </label>
                  <Textarea
                    id="capacity-override-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Why is this capacity exception appropriate?"
                    className="min-h-20 bg-background"
                  />
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Ask an owner or manager to approve a capacity override, or choose more seats.
                </p>
              )}
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(selectedIds, needsOverride ? reason.trim() : undefined)}
            disabled={!party || selectedIds.length === 0 || !validReason || submitting}
          >
            {submitting ? (mode === "seat" ? "Seating…" : "Assigning…") : mode === "seat" ? "Seat party" : "Assign tables"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
