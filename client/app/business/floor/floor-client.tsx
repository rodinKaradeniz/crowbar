"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Armchair, ChevronRight, Copy, Plus, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { OfflineBar } from "@/components/offline-bar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FloorPlanSeatingSheet } from "@/components/floor-plan-seating-sheet";
import { SkeletonList } from "@/components/ui/skeleton";
import { useFloorPlanSocket } from "@/hooks/use-floor-plan-socket";
import {
  clientArchiveFloorPlanArea,
  clientArchiveFloorPlanTable,
  clientCloseFloorPlanSeating,
  clientCreateFloorPlanArea,
  clientUpdateFloorPlanArea,
  clientUpdateFloorPlanTable,
  clientCreateFloorPlanCombination,
  clientCreateFloorPlanTable,
  clientGetFloorPlanAreas,
  clientGetFloorPlanBoard,
  clientGetFloorPlanCombinations,
  clientGetFloorPlanSettings,
  clientGetFloorPlanTables,
  clientGetFloorPlanTableQr,
  clientOpenFloorPlanSeating,
  clientOpenSeatingTab,
  clientReplaceFloorPlanAssignment,
  clientRotateFloorPlanTableQr,
  clientUpdateFloorPlanSettings,
  clientUpdateFloorPlanTableState,
} from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { PageBody, PageHeader } from "@/components/page-header";
import type {
  FloorPlanArea,
  FloorPlanBoard,
  FloorPlanBoardTable,
  FloorPlanCombination,
  FloorPlanParty,
  FloorPlanSettings,
  FloorPlanTable,
} from "@/types";

interface FloorClientProps {
  businessId: string;
  canManage: boolean;
  hasReservations: boolean;
  hasQueue: boolean;
  businessTimezone: string;
}

type SelectionMode = "seat" | "assign";

function formatVenueTime(value: string | undefined, businessTimezone: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { timeZone: businessTimezone, hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

/**
 * Table state is NEUTRAL. All five of them.
 *
 * This used to be a five-colour map — green available, amber reserved, brown
 * occupied, brass cleaning, red out of service. Under §08 none of it qualifies:
 * a table being occupied is not a thing to handle before the night ends, and a
 * red tile beside a genuinely late ticket makes the two look equally urgent.
 * See `tableStateSeverity()`.
 *
 * The states are told apart by GROUND and WORD instead: a table with a party on
 * it sits one surface step up and names who is there; a table out of service is
 * dimmed and says why. Both are readable across a dark room, which colour at
 * 10% opacity was not.
 */
function stateTone(state: FloorPlanBoardTable["displayState"]) {
  return {
    available: "border-border bg-card hover:border-border-strong",
    reserved: "border-border bg-secondary hover:border-border-strong",
    occupied: "border-border-strong bg-accent hover:border-primary",
    cleaning: "border-border bg-card hover:border-border-strong",
    out_of_service: "border-border bg-card opacity-60 hover:opacity-100",
  }[state];
}

function stateLabel(state: FloorPlanBoardTable["displayState"]) {
  return state === "cleaning" ? "needs reset" : state.replaceAll("_", " ");
}

function PartyCard({
  party,
  actionLabel,
  secondaryLabel,
  onAction,
  onSecondary,
  businessTimezone,
}: {
  party: FloorPlanParty;
  actionLabel: string;
  secondaryLabel?: string;
  onAction: () => void;
  onSecondary?: () => void;
  businessTimezone: string;
}) {
  return (
    <div className="border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{party.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{party.partySize}</span> guests · {party.sourceType === "queue" ? party.status : formatVenueTime(party.startsAt, businessTimezone)}
          </p>
          {/* Neutral. §08 names dietary notes as the case that does NOT
              qualify for a severity — it is information the host needs before
              seating, carried by weight and a word, not by red. */}
          {party.guestContext?.dietaryDetails && (
            <p className="mt-2 text-[13px] text-foreground">
              <span className="type-micro mr-1.5 text-muted-foreground">Note</span>
              {party.guestContext.dietaryDetails}
            </p>
          )}
          {party.guestContext?.tags.length ? <p className="mt-1 truncate text-xs text-muted-foreground">{party.guestContext.tags.join(" · ")}</p> : null}
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize">
          {party.sourceType === "queue" ? "Walk-in" : "Booking"}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="filter" className="flex-1" onClick={onAction}>{actionLabel}</Button>
        {secondaryLabel && onSecondary && (
          <Button size="filter" variant="secondary" onClick={onSecondary}>{secondaryLabel}</Button>
        )}
      </div>
      {party.customerId && <Link href={`/business/customers/${party.customerId}`} className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Guest profile</Link>}
    </div>
  );
}

function TableCard({ table, onClick, businessTimezone }: { table: FloorPlanBoardTable; onClick: () => void; businessTimezone: string }) {
  const detail = table.activeSeating?.source ?? table.activeAssignment ?? table.nextReservation;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[var(--tile-floor)] rounded-[var(--radius-3)] border p-3 text-left transition-colors",
        stateTone(table.displayState),
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[17px] font-semibold tabular-nums">
          {table.label}
        </span>
        <Badge tone="neutral">{stateLabel(table.displayState)}</Badge>
      </div>
      <p className="mt-1 font-mono text-[12px] tabular-nums text-muted-foreground">
        {table.capacity} seats
      </p>
      {detail ? (
        <div className="mt-4 border-t border-surface-3 pt-2">
          <p className="truncate text-sm font-medium">{detail.name}</p>
          <p className="text-xs text-muted-foreground">
            {table.activeSeating ? "Seated" : table.activeAssignment ? "At table" : `Next ${formatVenueTime(detail.startsAt, businessTimezone)}`}
          </p>
        </div>
      ) : table.operationalStateReason ? (
        <p className="mt-4 line-clamp-2 text-xs text-muted-foreground">{table.operationalStateReason}</p>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">Ready for a party</p>
      )}
    </button>
  );
}

function SetupPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const [areas, setAreas] = useState<FloorPlanArea[]>([]);
  const [tables, setTables] = useState<FloorPlanTable[]>([]);
  const [combinations, setCombinations] = useState<FloorPlanCombination[]>([]);
  const [settings, setSettings] = useState<FloorPlanSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [areaName, setAreaName] = useState("");
  const [newTable, setNewTable] = useState({ areaId: "", label: "", capacity: "2" });
  const [combinationName, setCombinationName] = useState("");
  const [combinationTableIds, setCombinationTableIds] = useState<string[]>([]);
  const [cutoff, setCutoff] = useState("");
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ type: "area" | "table"; id: string; label: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedAreas, loadedTables, loadedCombinations, loadedSettings] = await Promise.all([
        clientGetFloorPlanAreas(),
        clientGetFloorPlanTables(),
        clientGetFloorPlanCombinations(),
        clientGetFloorPlanSettings(),
      ]);
      setAreas(loadedAreas);
      setTables(loadedTables);
      setCombinations(loadedCombinations);
      setSettings(loadedSettings);
      setCutoff(loadedSettings.serviceDayCutoff.slice(0, 5));
      setNewTable((current) => ({ ...current, areaId: current.areaId || loadedAreas[0]?.id || "" }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load floor setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const finishMutation = async (message: string) => {
    await load();
    await onChanged();
    toast.success(message);
  };

  // Renaming an area or a table used to be impossible: the client-api update
  // functions existed but nothing called them, so the only way to fix a typo
  // was archive-plus-recreate — and recreating a table ISSUES A NEW QR CODE,
  // invalidating every printed code already on that table.
  const [editing, setEditing] = useState<
    { kind: "area" | "table"; id: string; label: string; capacity?: string } | null
  >(null);

  const saveEdit = async () => {
    if (!editing) return;
    const label = editing.label.trim();
    if (!label) return;
    try {
      if (editing.kind === "area") {
        await clientUpdateFloorPlanArea(editing.id, { name: label });
      } else {
        const capacity = Number(editing.capacity);
        await clientUpdateFloorPlanTable(editing.id, {
          label,
          ...(Number.isFinite(capacity) && capacity > 0 ? { capacity } : {}),
        });
      }
      setEditing(null);
      await onChanged();
      toast.success(editing.kind === "area" ? "Area renamed." : "Table updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that change.",
      );
    }
  };

  if (loading)
    return (
      <SkeletonList
        className="py-6"
        rows={5}
        columns={["w-[30%]", "w-[18%]", "w-[16%]"]}
      />
    );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="type-label text-muted-foreground">Areas and tables</p><h2 className="type-t1">Your floor, by area</h2></div>
          </div>
          {areas.length === 0 ? (
            <p className="border border-dashed p-6 text-sm text-muted-foreground">Create an area before adding tables.</p>
          ) : (
            <div className="space-y-3">
              {areas.map((area) => {
                const areaTables = tables.filter((table) => table.areaId === area.id);
                return (
                  <div key={area.id} className="border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      {editing?.kind === "area" && editing.id === area.id ? (
                        <div className="flex flex-1 items-center gap-2">
                          <Input
                            autoFocus
                            value={editing.label}
                            onChange={(event) => setEditing({ ...editing, label: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void saveEdit();
                              if (event.key === "Escape") setEditing(null);
                            }}
                            aria-label={`Rename ${area.name}`}
                          />
                          <Button size="filter" variant="secondary" onClick={() => void saveEdit()}>Save</Button>
                          <Button size="filter" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <>
                          <div><h3 className="font-semibold">{area.name}</h3><p className="text-xs text-muted-foreground">{areaTables.length} tables</p></div>
                          <div className="flex gap-2">
                            <Button size="filter" variant="ghost" onClick={() => setEditing({ kind: "area", id: area.id, label: area.name })}>Rename</Button>
                            <Button size="filter" variant="secondary" onClick={() => setArchiveTarget({ type: "area", id: area.id, label: area.name })}>Archive</Button>
                          </div>
                        </>
                      )}
                    </div>
                    {areaTables.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {areaTables.map((table) => (
                          <div key={table.id} className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                            {editing?.kind === "table" && editing.id === table.id ? (
                              <div className="flex flex-1 flex-wrap items-center gap-2">
                                <Input autoFocus value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} className="w-28" aria-label={`Rename ${table.label}`} />
                                <Input type="number" min={1} value={editing.capacity ?? ""} onChange={(event) => setEditing({ ...editing, capacity: event.target.value })} className="w-20" aria-label={`Seats at ${table.label}`} />
                                <Button size="filter" variant="secondary" onClick={() => void saveEdit()}>Save</Button>
                                <Button size="filter" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                              </div>
                            ) : (
                              <>
                                <span className="text-sm font-medium">{table.label} <span className="font-mono tabular-nums text-xs text-muted-foreground">· {table.capacity}</span></span>
                                <div className="flex gap-1">
                                  <Button size="filter" variant="ghost" onClick={() => setEditing({ kind: "table", id: table.id, label: table.label, capacity: String(table.capacity) })}>Edit</Button>
                                  <Button size="filter" variant="ghost" onClick={() => setArchiveTarget({ type: "table", id: table.id, label: table.label })}>Archive</Button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="border bg-card p-4">
          <p className="type-label text-muted-foreground">Table combinations</p>
          <p className="mt-1 text-sm text-muted-foreground">Only configured combinations may seat one party across multiple tables.</p>
          {combinations.length > 0 && <div className="mt-4 space-y-2">{combinations.map((item) => <div key={item.id} className="bg-muted/40 px-3 py-2 text-sm"><span className="font-medium">{item.name}</span><span className="font-mono tabular-nums ml-2 text-xs text-muted-foreground">{item.effectiveCapacity} seats</span></div>)}</div>}
          <div className="mt-4 space-y-3">
            <Input value={combinationName} onChange={(event) => setCombinationName(event.target.value)} placeholder="Combination name" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tables.map((table) => {
                const selected = combinationTableIds.includes(table.id);
                return <button key={table.id} type="button" onClick={() => setCombinationTableIds((ids) => selected ? ids.filter((id) => id !== table.id) : [...ids, table.id])} className={cn("border px-3 py-2 text-left text-sm", selected && "border-primary bg-primary/10")}>{table.label}<span className="font-mono tabular-nums ml-1 text-xs text-muted-foreground">{table.capacity}</span></button>;
              })}
            </div>
            <Button disabled={busy || combinationName.trim().length === 0 || combinationTableIds.length < 2} onClick={async () => { setBusy(true); try { await clientCreateFloorPlanCombination({ name: combinationName.trim(), tableIds: combinationTableIds }); setCombinationName(""); setCombinationTableIds([]); await finishMutation("Table combination created."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create combination."); } finally { setBusy(false); } }}>Create combination</Button>
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="border bg-card p-4">
          <p className="type-label text-muted-foreground">Add area</p>
          <div className="mt-3 flex gap-2"><Input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="e.g. Patio" /><Button disabled={busy || !areaName.trim()} onClick={async () => { setBusy(true); try { await clientCreateFloorPlanArea({ name: areaName.trim() }); setAreaName(""); await finishMutation("Area created."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create area."); } finally { setBusy(false); } }}><Plus /></Button></div>
        </section>
        <section className="border bg-card p-4">
          <p className="type-label text-muted-foreground">Add table</p>
          <div className="mt-3 space-y-2">
            <select value={newTable.areaId} onChange={(event) => setNewTable((current) => ({ ...current, areaId: event.target.value }))} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Choose area</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
            <Input value={newTable.label} onChange={(event) => setNewTable((current) => ({ ...current, label: event.target.value }))} placeholder="Table label" />
            <Input type="number" min="1" value={newTable.capacity} onChange={(event) => setNewTable((current) => ({ ...current, capacity: event.target.value }))} aria-label="Table capacity" />
            <Button className="w-full" disabled={busy || !newTable.areaId || !newTable.label.trim() || Number(newTable.capacity) < 1} onClick={async () => { setBusy(true); try { await clientCreateFloorPlanTable({ areaId: newTable.areaId, label: newTable.label.trim(), capacity: Number(newTable.capacity), shape: "square" }); setNewTable((current) => ({ ...current, label: "", capacity: "2" })); await finishMutation("Table created."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create table."); } finally { setBusy(false); } }}>Add table</Button>
          </div>
        </section>
        <section className="border bg-card p-4">
          <p className="type-label text-muted-foreground">Service day</p>
          <p className="mt-1 text-sm text-muted-foreground">{settings?.timezone}</p>
          <div className="mt-3 flex gap-2"><Input type="time" value={cutoff} onChange={(event) => setCutoff(event.target.value)} /><Button variant="secondary" disabled={busy || !cutoff} onClick={async () => { setBusy(true); try { await clientUpdateFloorPlanSettings(`${cutoff}:00`); await finishMutation("Service-day cutoff updated."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update cutoff."); } finally { setBusy(false); } }}>Save</Button></div>
        </section>
      </aside>
      <ConfirmationDialog open={archiveTarget !== null} onOpenChange={(open) => !open && setArchiveTarget(null)} title={`Archive ${archiveTarget?.label ?? "item"}?`} description="This removes it from the active floor plan. Existing history remains intact." confirmLabel="Archive" variant="destructive" onConfirm={() => { if (!archiveTarget) return; void (async () => { try { if (archiveTarget.type === "area") await clientArchiveFloorPlanArea(archiveTarget.id); else await clientArchiveFloorPlanTable(archiveTarget.id); await finishMutation("Floor plan updated."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not archive item."); } finally { setArchiveTarget(null); } })(); }} />
    </div>
  );
}

export default function FloorClient({ businessId, canManage, hasReservations, hasQueue, businessTimezone }: FloorClientProps) {
  const [board, setBoard] = useState<FloorPlanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<FloorPlanBoardTable | null>(null);
  const [selectedParty, setSelectedParty] = useState<FloorPlanParty | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("seat");
  const [selectionInitialTableIds, setSelectionInitialTableIds] = useState<string[]>([]);
  const [seatingOpen, setSeatingOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [outOfServiceReason, setOutOfServiceReason] = useState("");
  const [closeTarget, setCloseTarget] = useState<FloorPlanBoardTable | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrRotateTarget, setQrRotateTarget] = useState<FloorPlanBoardTable | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await clientGetFloorPlanBoard();
      setBoard(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the host board.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const { connected, lastContactAt } = useFloorPlanSocket(businessId, () => void refresh());
  const allTables = useMemo(() => board?.areas.flatMap((area) => area.tables) ?? [], [board]);
  const availableParties = useMemo(() => [
    ...(hasReservations ? board?.unassignedReservations ?? [] : []),
    ...(hasQueue ? board?.queueEntries ?? [] : []),
  ], [board, hasQueue, hasReservations]);

  const startSelection = (party: FloorPlanParty, mode: SelectionMode, initialTableIds?: string[]) => {
    setSelectedParty(party);
    setSelectionMode(mode);
    setSelectionInitialTableIds(initialTableIds ?? party.assignedTableIds);
    setSeatingOpen(true);
  };

  const submitSelection = async (tableIds: string[], capacityOverrideReason?: string) => {
    if (!selectedParty) return;
    setActionLoading(true);
    try {
      if (selectionMode === "seat") {
        await clientOpenFloorPlanSeating({ sourceType: selectedParty.sourceType, sourceId: selectedParty.sourceId, tableIds, capacityOverrideReason });
        toast.success(`${selectedParty.name} is seated.`);
      } else {
        await clientReplaceFloorPlanAssignment({ sourceType: selectedParty.sourceType, sourceId: selectedParty.sourceId, tableIds, capacityOverrideReason });
        toast.success(`Tables assigned to ${selectedParty.name}.`);
      }
      setSeatingOpen(false);
      setSelectedTable(null);
      setSelectionInitialTableIds([]);
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update the floor plan.");
    } finally {
      setActionLoading(false);
    }
  };

  const updateTableState = async (table: FloorPlanBoardTable, state: "ready" | "cleaning" | "out_of_service") => {
    const reason = state === "out_of_service" ? outOfServiceReason.trim() : undefined;
    if (state === "out_of_service" && !reason) { toast.error("A reason is required when taking a table out of service."); return; }
    setActionLoading(true);
    try {
      await clientUpdateFloorPlanTableState(table.id, { state, reason });
      setSelectedTable(null);
      setOutOfServiceReason("");
      await refresh();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update table state.");
    } finally { setActionLoading(false); }
  };

  const confirmCloseSeating = async () => {
    const seating = closeTarget?.activeSeating;
    if (!seating) return;
    setActionLoading(true);
    try {
      await clientCloseFloorPlanSeating(seating.seatingId);
      setCloseTarget(null);
      setSelectedTable(null);
      await refresh();
      toast.success("Seating closed; tables are ready for the next party.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not close seating.");
    } finally {
      setActionLoading(false);
    }
  };

  const openSeatingTab = async (seatingId: string) => {
    setActionLoading(true);
    try {
      const tab = await clientOpenSeatingTab(seatingId);
      window.location.assign(`/business/tabs?tab=${encodeURIComponent(tab.id)}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not open the tab.");
    } finally {
      setActionLoading(false);
    }
  };

  const showTableQr = async (tableId: string) => {
    setActionLoading(true);
    try {
      const qr = await clientGetFloorPlanTableQr(tableId);
      setQrUrl(new URL(qr.url, window.location.origin).toString());
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not load the table QR link.");
    } finally {
      setActionLoading(false);
    }
  };

  const rotateTableQr = async () => {
    if (!qrRotateTarget) return;
    setActionLoading(true);
    try {
      const qr = await clientRotateFloorPlanTableQr(qrRotateTarget.id);
      setQrUrl(new URL(qr.url, window.location.origin).toString());
      toast.success("The previous QR code no longer works.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not rotate the table QR code.");
    } finally {
      setActionLoading(false);
      setQrRotateTarget(null);
    }
  };

  if (loading) return <div className="px-[clamp(16px,2.5vw,32px)] py-6 flex min-h-80 items-center justify-center text-sm text-muted-foreground">Loading host board…</div>;

  return (
    <>
      <OfflineBar
        connected={connected}
        lastContactAt={lastContactAt}
        surface="The floor map"
        onRetry={() => void refresh()}
      />

      <>
      <PageHeader
        wide
        above={
          <p className="type-label text-muted-foreground">
            Service day · {board?.serviceDate ?? "—"}
          </p>
        }
        title="Floor map"
        description="Live tables, arrivals and walk-ins for this service day."
        actions={
          <>
            {/* Icon alone below --bp-phone: the label is what makes this control
                too wide for a 390px header row beside an h1. `aria-label` carries
                it at every width, so nothing is lost to a screen reader.

                The min-width is the other half of that. Dropping the label leaves
                `size="filter"`'s px-3 around a 16px icon — 42px measured, against
                the 48px height the tablet token takeover already gives it. Setting
                the width from the same token squares the target instead of leaving
                it 6px under the floor every other control on this surface clears.
                Above --bp-phone the label makes the button wider than 48 anyway,
                so the rule does nothing there. */}
            <Button
              size="filter"
              variant="secondary"
              className="min-w-[var(--control-desktop-min)]"
              aria-label="Refresh"
              onClick={() => void refresh()}
            >
              <RefreshCw aria-hidden />
              <span className="hidden phone:inline">Refresh</span>
            </Button>
          </>
        }
      />

      <PageBody wide>
        {error ? (
          <div className="mb-5 border-l-2 border-critical-fill bg-critical-tint px-4 py-3 text-[length:var(--ui-size)] text-critical-text">
            {error}
          </div>
        ) : null}
        <Tabs defaultValue="board">
          <TabsList><TabsTrigger value="board"><Armchair /> Host board</TabsTrigger>{canManage && <TabsTrigger value="setup"><Wrench /> Floor setup</TabsTrigger>}</TabsList>
          <TabsContent value="board" className="mt-6">
            {board && (
              <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="space-y-7">
                  {board.areas.length === 0 ? (
                    <EmptyState
                      title="No tables yet"
                      description={
                        canManage
                          ? "Draw your room once — areas, then tables and their seats — and the floor map, the QR codes and seating all work from it."
                          : "A manager needs to draw the room before this board can seat anyone."
                      }
                    />
                  ) : board.areas.map((area) => (
                    <section key={area.id}>
                      <div className="mb-3 flex items-baseline justify-between"><h2 className="type-t2">{area.name}</h2><span className="font-mono tabular-nums text-xs text-muted-foreground">{area.tables.length} tables</span></div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{area.tables.map((table) => <TableCard key={table.id} table={table} businessTimezone={businessTimezone} onClick={() => { setQrUrl(null); setSelectedTable(table); }} />)}</div>
                    </section>
                  ))}
                </div>
                <aside className="space-y-6 xl:sticky xl:top-[calc(var(--workspace-header)+var(--page-header))] xl:self-start">
                  {hasReservations && <section><div className="mb-2 flex items-center justify-between"><p className="type-label text-muted-foreground">Unassigned arrivals</p><span className="font-mono tabular-nums text-xs text-muted-foreground">{board.unassignedReservations.length}</span></div><div className="space-y-2">{board.unassignedReservations.length ? board.unassignedReservations.map((party) => <PartyCard key={party.sourceId} party={party} actionLabel="Seat" secondaryLabel="Assign" businessTimezone={businessTimezone} onAction={() => startSelection(party, "seat")} onSecondary={() => startSelection(party, "assign")} />) : <p className="bg-muted/40 px-3 py-4 text-sm text-muted-foreground">No unassigned arrivals.</p>}</div></section>}
                  {hasQueue && <section><div className="mb-2 flex items-center justify-between"><p className="type-label text-muted-foreground">Walk-ins</p><span className="font-mono tabular-nums text-xs text-muted-foreground">{board.queueEntries.length}</span></div><div className="space-y-2">{board.queueEntries.length ? board.queueEntries.map((party) => <PartyCard key={party.sourceId} party={party} actionLabel="Seat" secondaryLabel={party.assignedTableIds.length ? "Reassign" : "Assign"} businessTimezone={businessTimezone} onAction={() => startSelection(party, "seat", party.assignedTableIds)} onSecondary={() => startSelection(party, "assign", party.assignedTableIds)} />) : <p className="bg-muted/40 px-3 py-4 text-sm text-muted-foreground">No active walk-ins.</p>}</div></section>}
                </aside>
              </div>
            )}
          </TabsContent>
          {canManage && <TabsContent value="setup" className="mt-6"><SetupPanel onChanged={refresh} /></TabsContent>}
        </Tabs>

        {/* The table detail is a SIDE PANEL, per §06 — not a modal pinned to the
            bottom of the viewport. It never takes the floor away from the host,
            which is the point: you seat a party while looking at the room. */}
        <Sheet
          open={selectedTable !== null}
          onOpenChange={(open) => !open && setSelectedTable(null)}
        >
          <SheetContent side="right" className="flex flex-col">
            {selectedTable ? (
              <>
                <SheetHeader>
                  <p className="type-label text-muted-foreground">
                    {stateLabel(selectedTable.displayState)}
                  </p>
                  <SheetTitle>Table {selectedTable.label}</SheetTitle>
                  <SheetDescription>
                    {selectedTable.capacity} seats
                  </SheetDescription>
                </SheetHeader>

                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                  {selectedTable.activeSeating ? (
                    <>
                      <p className="text-[length:var(--ui-size)]">
                        <span className="font-medium">
                          {selectedTable.activeSeating.source.name}
                        </span>{" "}
                        is seated here.
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          void openSeatingTab(selectedTable.activeSeating!.seatingId)
                        }
                        disabled={actionLoading}
                      >
                        {selectedTable.activeSeating.openTabId
                          ? "Open tab"
                          : "Start tab"}
                      </Button>
                      {selectedTable.activeSeating.openTabId ? (
                        <p className="border-l-2 border-border-strong bg-secondary px-3 py-2.5 text-[13px] text-muted-foreground">
                          The tab has to be settled externally before this seating
                          can close.
                        </p>
                      ) : (
                        <Button onClick={() => setCloseTarget(selectedTable)}>
                          Close seating
                        </Button>
                      )}
                    </>
                  ) : selectedTable.activeAssignment ? (
                    <>
                      <p className="text-[length:var(--ui-size)]">
                        <span className="font-medium">
                          {selectedTable.activeAssignment.name}
                        </span>{" "}
                        is assigned here.
                      </p>
                      <Button
                        onClick={() =>
                          startSelection(
                            selectedTable.activeAssignment!,
                            "seat",
                            selectedTable.activeAssignment!.assignedTableIds,
                          )
                        }
                      >
                        Seat party
                      </Button>
                    </>
                  ) : selectedTable.displayState === "cleaning" ? (
                    <>
                      <p className="text-[length:var(--ui-size)] text-muted-foreground">
                        Needs a reset before it can take a party.
                      </p>
                      <Button
                        onClick={() => void updateTableState(selectedTable, "ready")}
                        disabled={actionLoading}
                      >
                        Mark ready
                      </Button>
                    </>
                  ) : selectedTable.displayState === "out_of_service" ? (
                    <>
                      <p className="text-[length:var(--ui-size)] text-muted-foreground">
                        {selectedTable.operationalStateReason ||
                          "Out of service for now."}
                      </p>
                      <Button
                        onClick={() => void updateTableState(selectedTable, "ready")}
                        disabled={actionLoading}
                      >
                        Return to service
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-[length:var(--ui-size)] text-muted-foreground">
                        Pick an arrival or a walk-in to seat here.
                      </p>
                      {availableParties.length ? (
                        <div className="flex flex-col gap-2">
                          {availableParties.map((party) => (
                            <Button
                              key={party.sourceId}
                              variant="secondary"
                              className="justify-between"
                              onClick={() =>
                                startSelection(party, "seat", [selectedTable.id])
                              }
                            >
                              <span className="truncate">{party.name}</span>
                              <ChevronRight />
                            </Button>
                          ))}
                        </div>
                      ) : (
                        <p className="border-l-2 border-border-strong bg-secondary px-3 py-2.5 text-[13px] text-muted-foreground">
                          Nobody is waiting to be seated.
                        </p>
                      )}
                    </>
                  )}

                  {canManage ? (
                    <details className="border border-border p-3">
                      <summary className="cursor-pointer text-[length:var(--ui-size)] font-medium">
                        Guest QR code
                      </summary>
                      <p className="mt-2 text-[13px] text-muted-foreground">
                        Guests can only order while this table has a party seated
                        on it.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="secondary"
                          size="filter"
                          onClick={() => void showTableQr(selectedTable.id)}
                          disabled={actionLoading}
                        >
                          Show link
                        </Button>
                        <Button
                          variant="secondary"
                          size="filter"
                          onClick={() => setQrRotateTarget(selectedTable)}
                          disabled={actionLoading}
                        >
                          Rotate
                        </Button>
                      </div>
                      {qrUrl ? (
                        <div className="mt-3 flex gap-2">
                          <Input value={qrUrl} readOnly aria-label="Guest QR link" />
                          <Button
                            size="icon-md"
                            variant="secondary"
                            aria-label="Copy guest QR link"
                            onClick={() =>
                              void navigator.clipboard
                                .writeText(qrUrl)
                                .then(() => toast.success("QR link copied."))
                            }
                          >
                            <Copy />
                          </Button>
                        </div>
                      ) : null}
                    </details>
                  ) : null}

                  {selectedTable.operationalState === "ready" &&
                  !selectedTable.activeSeating ? (
                    <details className="border border-border p-3">
                      <summary className="cursor-pointer text-[length:var(--ui-size)] font-medium">
                        More table actions
                      </summary>
                      <Button
                        variant="secondary"
                        size="filter"
                        className="mt-3"
                        onClick={() =>
                          void updateTableState(selectedTable, "cleaning")
                        }
                        disabled={actionLoading}
                      >
                        Mark needs reset
                      </Button>
                      <Textarea
                        value={outOfServiceReason}
                        onChange={(event) =>
                          setOutOfServiceReason(event.target.value)
                        }
                        className="mt-3 min-h-20"
                        placeholder="Why is it coming out of service?"
                      />
                      {/* Quiet outline in red text — the risky choice, not the
                          loud one. */}
                      <Button
                        variant="destructive-quiet"
                        size="filter"
                        className="mt-2"
                        onClick={() =>
                          void updateTableState(selectedTable, "out_of_service")
                        }
                        disabled={actionLoading || !outOfServiceReason.trim()}
                      >
                        Take out of service
                      </Button>
                    </details>
                  ) : null}
                </div>
              </>
            ) : null}
          </SheetContent>
        </Sheet>

        <FloorPlanSeatingSheet key={`${selectedParty?.sourceId ?? "no-party"}-${selectionMode}-${selectionInitialTableIds.join("-")}`} open={seatingOpen} onOpenChange={setSeatingOpen} party={selectedParty} tables={allTables} initialTableIds={selectionInitialTableIds} canOverride={canManage} mode={selectionMode} submitting={actionLoading} onConfirm={(tableIds, reason) => void submitSelection(tableIds, reason)} />
        <ConfirmationDialog open={closeTarget !== null} onOpenChange={(open) => !open && setCloseTarget(null)} title="Close seating?" description="This completes the visit and returns each table to ready." confirmLabel="Close seating" onConfirm={() => void confirmCloseSeating()} />
        <ConfirmationDialog open={qrRotateTarget !== null} onOpenChange={(open) => !open && setQrRotateTarget(null)} title="Rotate this table QR code?" description="The code printed on the table stops working the moment you do. Anyone holding a menu from the old code will have to scan again." confirmLabel="Rotate the code" variant="destructive" onConfirm={() => void rotateTableQr()} />
      </PageBody>
    </>
    </>
  );
}
