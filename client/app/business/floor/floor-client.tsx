"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Armchair,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Loader2,
  Plus,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { FloorPlanSeatingSheet } from "@/components/floor-plan-seating-sheet";
import { useFloorPlanSocket } from "@/hooks/use-floor-plan-socket";
import {
  clientArchiveFloorPlanArea,
  clientArchiveFloorPlanTable,
  clientCloseFloorPlanSeating,
  clientCreateFloorPlanArea,
  clientCreateFloorPlanCombination,
  clientCreateFloorPlanTable,
  clientGetFloorPlanAreas,
  clientGetFloorPlanBoard,
  clientGetFloorPlanCombinations,
  clientGetFloorPlanSettings,
  clientGetFloorPlanTables,
  clientOpenFloorPlanSeating,
  clientReplaceFloorPlanAssignment,
  clientUpdateFloorPlanSettings,
  clientUpdateFloorPlanTableState,
} from "@/lib/client-api";
import { cn } from "@/lib/utils";
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
}

type SelectionMode = "seat" | "assign";

function formatVenueTime(value?: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

function stateTone(state: FloorPlanBoardTable["displayState"]) {
  return {
    available: "border-lager/50 bg-lager/10 hover:border-lager",
    reserved: "border-marzen/50 bg-marzen/10 hover:border-marzen",
    occupied: "border-dubbel/50 bg-dubbel/10 hover:border-dubbel",
    cleaning: "border-brass/50 bg-brass/10 hover:border-brass",
    out_of_service: "border-oxblood/50 bg-oxblood/10 hover:border-oxblood",
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
}: {
  party: FloorPlanParty;
  actionLabel: string;
  secondaryLabel?: string;
  onAction: () => void;
  onSecondary?: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{party.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span className="figures">{party.partySize}</span> guests · {party.sourceType === "queue" ? party.status : formatVenueTime(party.startsAt)}
          </p>
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium capitalize">
          {party.sourceType === "queue" ? "Walk-in" : "Booking"}
        </span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" onClick={onAction}>{actionLabel}</Button>
        {secondaryLabel && onSecondary && (
          <Button size="sm" variant="outline" onClick={onSecondary}>{secondaryLabel}</Button>
        )}
      </div>
    </div>
  );
}

function TableCard({ table, onClick }: { table: FloorPlanBoardTable; onClick: () => void }) {
  const detail = table.activeSeating?.source ?? table.activeAssignment ?? table.nextReservation;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-32 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        stateTone(table.displayState),
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="figures text-lg font-bold">{table.label}</span>
        <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[10px] font-medium capitalize">
          {stateLabel(table.displayState)}
        </span>
      </div>
      <p className="figures mt-1 text-xs text-muted-foreground">{table.capacity} seats</p>
      {detail ? (
        <div className="mt-4 border-t border-foreground/10 pt-2">
          <p className="truncate text-sm font-medium">{detail.name}</p>
          <p className="text-xs text-muted-foreground">
            {table.activeSeating ? "Seated" : table.activeAssignment ? "At table" : `Next ${formatVenueTime(detail.startsAt)}`}
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

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading floor setup…</div>;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div><p className="eyebrow">Areas and tables</p><h2 className="text-xl font-semibold">Your floor, by area</h2></div>
          </div>
          {areas.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">Create an area before adding tables.</p>
          ) : (
            <div className="space-y-3">
              {areas.map((area) => {
                const areaTables = tables.filter((table) => table.areaId === area.id);
                return (
                  <div key={area.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div><h3 className="font-semibold">{area.name}</h3><p className="text-xs text-muted-foreground">{areaTables.length} tables</p></div>
                      <Button size="sm" variant="outline" onClick={() => setArchiveTarget({ type: "area", id: area.id, label: area.name })}>Archive</Button>
                    </div>
                    {areaTables.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {areaTables.map((table) => (
                          <div key={table.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                            <span className="text-sm font-medium">{table.label} <span className="figures text-xs text-muted-foreground">· {table.capacity}</span></span>
                            <Button size="sm" variant="ghost" onClick={() => setArchiveTarget({ type: "table", id: table.id, label: table.label })}>Archive</Button>
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

        <section className="rounded-xl border bg-card p-4">
          <p className="eyebrow">Table combinations</p>
          <p className="mt-1 text-sm text-muted-foreground">Only configured combinations may seat one party across multiple tables.</p>
          {combinations.length > 0 && <div className="mt-4 space-y-2">{combinations.map((item) => <div key={item.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm"><span className="font-medium">{item.name}</span><span className="figures ml-2 text-xs text-muted-foreground">{item.effectiveCapacity} seats</span></div>)}</div>}
          <div className="mt-4 space-y-3">
            <Input value={combinationName} onChange={(event) => setCombinationName(event.target.value)} placeholder="Combination name" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tables.map((table) => {
                const selected = combinationTableIds.includes(table.id);
                return <button key={table.id} type="button" onClick={() => setCombinationTableIds((ids) => selected ? ids.filter((id) => id !== table.id) : [...ids, table.id])} className={cn("rounded-lg border px-3 py-2 text-left text-sm", selected && "border-primary bg-primary/10")}>{table.label}<span className="figures ml-1 text-xs text-muted-foreground">{table.capacity}</span></button>;
              })}
            </div>
            <Button disabled={busy || combinationName.trim().length === 0 || combinationTableIds.length < 2} onClick={async () => { setBusy(true); try { await clientCreateFloorPlanCombination({ name: combinationName.trim(), tableIds: combinationTableIds }); setCombinationName(""); setCombinationTableIds([]); await finishMutation("Table combination created."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create combination."); } finally { setBusy(false); } }}>Create combination</Button>
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        <section className="rounded-xl border bg-card p-4">
          <p className="eyebrow">Add area</p>
          <div className="mt-3 flex gap-2"><Input value={areaName} onChange={(event) => setAreaName(event.target.value)} placeholder="e.g. Patio" /><Button disabled={busy || !areaName.trim()} onClick={async () => { setBusy(true); try { await clientCreateFloorPlanArea({ name: areaName.trim() }); setAreaName(""); await finishMutation("Area created."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create area."); } finally { setBusy(false); } }}><Plus /></Button></div>
        </section>
        <section className="rounded-xl border bg-card p-4">
          <p className="eyebrow">Add table</p>
          <div className="mt-3 space-y-2">
            <select value={newTable.areaId} onChange={(event) => setNewTable((current) => ({ ...current, areaId: event.target.value }))} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Choose area</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
            <Input value={newTable.label} onChange={(event) => setNewTable((current) => ({ ...current, label: event.target.value }))} placeholder="Table label" />
            <Input type="number" min="1" value={newTable.capacity} onChange={(event) => setNewTable((current) => ({ ...current, capacity: event.target.value }))} aria-label="Table capacity" />
            <Button className="w-full" disabled={busy || !newTable.areaId || !newTable.label.trim() || Number(newTable.capacity) < 1} onClick={async () => { setBusy(true); try { await clientCreateFloorPlanTable({ areaId: newTable.areaId, label: newTable.label.trim(), capacity: Number(newTable.capacity), shape: "square" }); setNewTable((current) => ({ ...current, label: "", capacity: "2" })); await finishMutation("Table created."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create table."); } finally { setBusy(false); } }}>Add table</Button>
          </div>
        </section>
        <section className="rounded-xl border bg-card p-4">
          <p className="eyebrow">Service day</p>
          <p className="mt-1 text-sm text-muted-foreground">{settings?.timezone}</p>
          <div className="mt-3 flex gap-2"><Input type="time" value={cutoff} onChange={(event) => setCutoff(event.target.value)} /><Button variant="outline" disabled={busy || !cutoff} onClick={async () => { setBusy(true); try { await clientUpdateFloorPlanSettings(`${cutoff}:00`); await finishMutation("Service-day cutoff updated."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update cutoff."); } finally { setBusy(false); } }}>Save</Button></div>
        </section>
      </aside>
      <ConfirmationDialog open={archiveTarget !== null} onOpenChange={(open) => !open && setArchiveTarget(null)} title={`Archive ${archiveTarget?.label ?? "item"}?`} description="This removes it from the active floor plan. Existing history remains intact." confirmLabel="Archive" variant="destructive" onConfirm={() => { if (!archiveTarget) return; void (async () => { try { if (archiveTarget.type === "area") await clientArchiveFloorPlanArea(archiveTarget.id); else await clientArchiveFloorPlanTable(archiveTarget.id); await finishMutation("Floor plan updated."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not archive item."); } finally { setArchiveTarget(null); } })(); }} />
    </div>
  );
}

export default function FloorClient({ businessId, canManage, hasReservations, hasQueue }: FloorClientProps) {
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
  const { connected } = useFloorPlanSocket(businessId, () => void refresh());
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

  if (loading) return <div className="page-pad flex min-h-80 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading host board…</div>;

  return (
    <div className="page-pad">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Service day · {board?.serviceDate}</p>
          <h1 className="page-title">Floor</h1>
          <p className="page-description">Live tables, arrivals, and walk-ins for this service day.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          {connected ? <Wifi className="h-4 w-4 text-lager" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
          <span className={connected ? "text-lager" : "text-muted-foreground"}>{connected ? "Live" : "Reconnecting"}</span>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>Refresh</Button>
        </div>
      </div>

      {error && <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      <Tabs defaultValue="board">
        <TabsList><TabsTrigger value="board"><Armchair /> Host board</TabsTrigger>{canManage && <TabsTrigger value="setup"><Wrench /> Floor setup</TabsTrigger>}</TabsList>
        <TabsContent value="board" className="mt-6">
          {board && (
            <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-7">
                {board.areas.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-10 text-center"><Armchair className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No tables configured</p><p className="mt-1 text-sm text-muted-foreground">{canManage ? "Use Floor setup to add your first area and table." : "Ask a manager to configure the floor."}</p></div>
                ) : board.areas.map((area) => (
                  <section key={area.id}>
                    <div className="mb-3 flex items-baseline justify-between"><h2 className="text-lg font-semibold">{area.name}</h2><span className="figures text-xs text-muted-foreground">{area.tables.length} tables</span></div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{area.tables.map((table) => <TableCard key={table.id} table={table} onClick={() => setSelectedTable(table)} />)}</div>
                  </section>
                ))}
              </div>
              <aside className="space-y-6 xl:sticky xl:top-4 xl:self-start">
                {hasReservations && <section><div className="mb-2 flex items-center justify-between"><p className="eyebrow">Unassigned arrivals</p><span className="figures text-xs text-muted-foreground">{board.unassignedReservations.length}</span></div><div className="space-y-2">{board.unassignedReservations.length ? board.unassignedReservations.map((party) => <PartyCard key={party.sourceId} party={party} actionLabel="Seat" secondaryLabel="Assign" onAction={() => startSelection(party, "seat")} onSecondary={() => startSelection(party, "assign")} />) : <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">No unassigned arrivals.</p>}</div></section>}
                {hasQueue && <section><div className="mb-2 flex items-center justify-between"><p className="eyebrow">Walk-ins</p><span className="figures text-xs text-muted-foreground">{board.queueEntries.length}</span></div><div className="space-y-2">{board.queueEntries.length ? board.queueEntries.map((party) => <PartyCard key={party.sourceId} party={party} actionLabel="Seat" secondaryLabel={party.assignedTableIds.length ? "Reassign" : "Assign"} onAction={() => startSelection(party, "seat", party.assignedTableIds)} onSecondary={() => startSelection(party, "assign", party.assignedTableIds)} />) : <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">No active walk-ins.</p>}</div></section>}
              </aside>
            </div>
          )}
        </TabsContent>
        {canManage && <TabsContent value="setup" className="mt-6"><SetupPanel onChanged={refresh} /></TabsContent>}
      </Tabs>

      {selectedTable && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40 p-0 sm:items-center sm:justify-center sm:p-4" role="presentation" onMouseDown={() => setSelectedTable(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Table ${selectedTable.label}`} className="w-full rounded-t-xl border bg-background p-5 shadow-lg sm:max-w-md sm:rounded-xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{stateLabel(selectedTable.displayState)}</p><h2 className="mt-1 text-xl font-semibold">Table {selectedTable.label}</h2><p className="figures text-sm text-muted-foreground">{selectedTable.capacity} seats</p></div><Button variant="ghost" size="sm" onClick={() => setSelectedTable(null)}>Close</Button></div>
            <div className="mt-5 space-y-3">
              {selectedTable.activeSeating ? <><p className="text-sm"><span className="font-medium">{selectedTable.activeSeating.source.name}</span> is currently seated here.</p><Button className="w-full" onClick={() => setCloseTarget(selectedTable)}><CheckCircle2 /> Close seating</Button></> : selectedTable.activeAssignment ? <><p className="text-sm"><span className="font-medium">{selectedTable.activeAssignment.name}</span> is assigned here.</p><Button className="w-full" onClick={() => startSelection(selectedTable.activeAssignment!, "seat", selectedTable.activeAssignment!.assignedTableIds)}><Users /> Seat party</Button></> : selectedTable.displayState === "cleaning" ? <><p className="text-sm text-muted-foreground">This table needs a quick reset before it can be seated.</p><Button className="w-full" onClick={() => void updateTableState(selectedTable, "ready")} disabled={actionLoading}><Sparkles /> Mark ready</Button></> : selectedTable.displayState === "out_of_service" ? <><p className="text-sm text-muted-foreground">{selectedTable.operationalStateReason || "Temporarily unavailable"}</p><Button className="w-full" onClick={() => void updateTableState(selectedTable, "ready")} disabled={actionLoading}>Return to service</Button></> : <><p className="text-sm text-muted-foreground">Choose an unassigned arrival or walk-in to seat here.</p>{availableParties.length ? <div className="space-y-2">{availableParties.map((party) => <Button key={party.sourceId} variant="outline" className="w-full justify-between" onClick={() => startSelection(party, "seat", [selectedTable.id])}><span className="truncate">{party.name}</span><ChevronRight /></Button>)}</div> : <p className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">No unassigned parties are waiting.</p>}</>}
              {selectedTable.operationalState === "ready" && !selectedTable.activeSeating && <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">More table actions</summary><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void updateTableState(selectedTable, "cleaning")} disabled={actionLoading}><Sparkles /> Mark needs reset</Button></div><Textarea value={outOfServiceReason} onChange={(event) => setOutOfServiceReason(event.target.value)} className="mt-3 min-h-20" placeholder="Reason for temporary closure" /><Button variant="destructive" size="sm" className="mt-2" onClick={() => void updateTableState(selectedTable, "out_of_service")} disabled={actionLoading || !outOfServiceReason.trim()}><CircleAlert /> Take out of service</Button></details>}
            </div>
          </div>
        </div>
      )}

      <FloorPlanSeatingSheet key={`${selectedParty?.sourceId ?? "no-party"}-${selectionMode}-${selectionInitialTableIds.join("-")}`} open={seatingOpen} onOpenChange={setSeatingOpen} party={selectedParty} tables={allTables} initialTableIds={selectionInitialTableIds} canOverride={canManage} mode={selectionMode} submitting={actionLoading} onConfirm={(tableIds, reason) => void submitSelection(tableIds, reason)} />
      <ConfirmationDialog open={closeTarget !== null} onOpenChange={(open) => !open && setCloseTarget(null)} title="Close seating?" description="This completes the visit and returns each table to ready." confirmLabel="Close seating" onConfirm={() => void confirmCloseSeating()} />
    </div>
  );
}
