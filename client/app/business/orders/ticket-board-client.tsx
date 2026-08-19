"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Power, PowerOff, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRegionalSettings } from "@/contexts/regional-context";
import { useOrderSocket } from "@/hooks/use-order-socket";
import {
  clientAdvanceOrderLineStatus,
  clientCancelOrder,
  clientCorrectOrder,
  clientGetOrderAllDayCounts,
  clientGetOrders,
  clientGetOrderingSettings,
  clientGetPreparationStations,
  clientSetOrderingSettings,
} from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Order, OrderAllDayCount, OrderLineItem, PreparationStation } from "@/types";

const STATUSES = ["received", "preparing", "ready", "served"] as const;
type BoardStatus = (typeof STATUSES)[number];
const LABELS: Record<string, string> = { received: "Received", preparing: "Preparing", ready: "Ready", served: "Served", cancelled: "Cancelled" };
const NEXT: Record<BoardStatus, BoardStatus | null> = { received: "preparing", preparing: "ready", ready: "served", served: null };
const PREV: Record<BoardStatus, BoardStatus | null> = { received: null, preparing: "received", ready: "preparing", served: "ready" };
const ACCENTS: Record<BoardStatus, string> = { received: "border-t-blue-400", preparing: "border-t-amber-400", ready: "border-t-green-400", served: "border-t-muted-foreground/40" };

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function lineMatchesStation(line: OrderLineItem, stationId: string) {
  return stationId === "all" || line.routesToAllStations || line.preparationStationId === stationId;
}

export function TicketBoardClient({ businessId }: { businessId: string }) {
  const { currencyCode, locale } = useRegionalSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stations, setStations] = useState<PreparationStation[]>([]);
  const [counts, setCounts] = useState<OrderAllDayCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [togglingOrders, setTogglingOrders] = useState(false);
  const [stationId, setStationId] = useState("all");
  const [correctTarget, setCorrectTarget] = useState<Order | null>(null);
  const [correctQuantities, setCorrectQuantities] = useState<Record<string, number>>({});
  const [correctReason, setCorrectReason] = useState("");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const knownIds = useRef(new Set<string>());
  const [, tick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const [nextOrders, nextStations, nextCounts, settings] = await Promise.all([
        clientGetOrders(businessId), clientGetPreparationStations(), clientGetOrderAllDayCounts(), clientGetOrderingSettings(businessId),
      ]);
      setOrders(nextOrders); setStations(nextStations.filter((station) => station.isActive)); setCounts(nextCounts); setIsAcceptingOrders(settings.isAcceptingOrders);
      nextOrders.forEach((order) => knownIds.current.add(order.id));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load the order board");
    } finally { setLoading(false); }
  }, [businessId]);

  useEffect(() => { void refresh(); const timer = setInterval(() => tick((value) => value + 1), 30_000); return () => clearInterval(timer); }, [refresh]);
  const { connected } = useOrderSocket(businessId, (incoming) => {
    incoming.forEach((order) => {
      if (!knownIds.current.has(order.id)) {
        knownIds.current.add(order.id);
        toast(`New order${order.tableIdentifier ? ` — Table ${order.tableIdentifier}` : ""}`, { description: `${order.lineItems.length} line(s) · ${formatMoney(order.totalAmount, currencyCode, locale)}` });
      }
    });
    setOrders(incoming);
    void clientGetOrderAllDayCounts().then(setCounts).catch(() => {});
  });
  useEffect(() => { if (connected) void refresh(); }, [connected, refresh]);

  async function toggleAcceptingOrders() {
    setTogglingOrders(true);
    try {
      const result = await clientSetOrderingSettings(businessId, !isAcceptingOrders);
      setIsAcceptingOrders(result.isAcceptingOrders);
      toast.success(result.isAcceptingOrders ? "Now accepting orders" : "Orders paused");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update ordering"); }
    finally { setTogglingOrders(false); }
  }

  async function moveLine(order: Order, line: OrderLineItem, target: BoardStatus) {
    const previous = orders;
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, lineItems: item.lineItems.map((candidate) => candidate.id === line.id ? { ...candidate, lineStatus: target } : candidate) } : item));
    try {
      const updated = await clientAdvanceOrderLineStatus(businessId, order.id, line.id, target);
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setCounts(await clientGetOrderAllDayCounts());
    } catch (error) {
      setOrders(previous);
      toast.error(error instanceof Error ? error.message : "Could not update the line");
    }
  }

  function openCorrection(order: Order) {
    setCorrectTarget(order);
    setCorrectReason("");
    setCorrectQuantities(Object.fromEntries(order.lineItems.map((line) => [line.id, line.quantity])));
  }

  async function correctOrder() {
    if (!correctTarget || !correctReason.trim()) return;
    setCommandBusy(true);
    try {
      const updated = await clientCorrectOrder(businessId, correctTarget.id, {
        items: correctTarget.lineItems.filter((line) => correctQuantities[line.id] > 0 && line.itemId).map((line) => ({
          itemId: line.itemId!, quantity: correctQuantities[line.id], notes: line.notes,
          selectedModifiers: line.selectedModifiers.map((modifier) => ({ modifierId: modifier.modifierId })),
        })),
        notes: correctTarget.notes,
        reason: correctReason.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
      setCorrectTarget(null); toast.success("Order corrected and repriced from current authority.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not correct the order"); }
    finally { setCommandBusy(false); }
  }

  async function cancelOrder() {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCommandBusy(true);
    try {
      const updated = await clientCancelOrder(businessId, cancelTarget.id, cancelReason.trim(), crypto.randomUUID());
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
      setCancelTarget(null); setCancelReason(""); toast.success("Order cancelled and outstanding stock movements reversed.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not cancel the order"); }
    finally { setCommandBusy(false); }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading orders…</div>;

  const visibleCounts = counts.filter((count) => stationId === "all" || count.routesToAllStations || count.preparationStationId === stationId);
  return (
    <div className="page-pad space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="page-title">Orders</h1><p className="mt-1 text-sm text-muted-foreground">Each preparation line progresses independently.</p></div>
        <div className="flex items-center gap-3"><Button variant={isAcceptingOrders ? "outline" : "destructive"} size="sm" onClick={() => void toggleAcceptingOrders()} disabled={togglingOrders}>{isAcceptingOrders ? <PowerOff className="mr-1.5 h-3.5 w-3.5" /> : <Power className="mr-1.5 h-3.5 w-3.5" />}{isAcceptingOrders ? "Pause Orders" : "Resume Orders"}</Button><div className="flex items-center gap-1.5 text-sm text-muted-foreground">{connected ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-amber-600" />}{connected ? "Live" : "Stale — reconnecting"}</div></div>
      </div>
      {loadError && <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{loadError}<Button variant="ghost" size="sm" onClick={() => void refresh()}>Retry</Button></div>}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border p-1 w-fit"><StationTab active={stationId === "all"} onClick={() => setStationId("all")} label="All" icon={<LayoutGrid className="h-3.5 w-3.5" />} />{stations.map((station) => <StationTab key={station.id} active={stationId === station.id} onClick={() => setStationId(station.id)} label={station.name} />)}</div>
      {stations.length === 0 && <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No preparation stations are configured. Shared lines remain visible; managers can add stations in Menu Management.</div>}
      {visibleCounts.length > 0 && <section className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">All-day counts</p><div className="flex flex-wrap gap-2">{visibleCounts.map((count, index) => <Badge key={`${count.preparationStationId}-${count.itemName}-${count.lineStatus}-${index}`} variant="outline">{count.quantity}× {count.itemName} · {LABELS[count.lineStatus] ?? count.lineStatus}{count.routesToAllStations ? " · Shared" : ""}</Badge>)}</div></section>}
      {!isAcceptingOrders && <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">Ordering is paused — guests cannot place new rounds.</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{STATUSES.map((status) => {
        const statusOrders = orders.filter((order) => order.status !== "cancelled" && order.lineItems.some((line) => line.lineStatus === status && lineMatchesStation(line, stationId)));
        return <div key={status} className={`space-y-3 rounded-lg border border-t-4 bg-muted/20 p-3 ${ACCENTS[status]}`}><div className="flex items-center gap-2"><h2 className="text-sm font-semibold uppercase tracking-wide">{LABELS[status]}</h2><Badge variant="secondary">{statusOrders.length}</Badge></div>{statusOrders.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">Empty</div> : statusOrders.map((order) => <OrderTicket key={order.id} order={order} status={status} stationId={stationId} onMoveLine={moveLine} onCorrect={openCorrection} onCancel={(target) => { setCancelTarget(target); setCancelReason(""); }} />)}</div>;
      })}</div>

      <Dialog open={correctTarget !== null} onOpenChange={(open) => !open && setCorrectTarget(null)}><DialogContent><DialogHeader><DialogTitle>Correct order</DialogTitle></DialogHeader><div className="space-y-3"><p className="text-sm text-muted-foreground">Content changes are allowed only before every line starts preparation. Prices and tax snapshots are resolved again by the server.</p>{correctTarget?.lineItems.map((line) => <div key={line.id} className="flex items-center justify-between gap-3"><span className="text-sm">{line.itemName}</span><Input className="w-24" type="number" min={0} value={correctQuantities[line.id] ?? line.quantity} onChange={(event) => setCorrectQuantities((current) => ({ ...current, [line.id]: Number(event.target.value) }))} /></div>)}<Textarea placeholder="Required correction reason" value={correctReason} onChange={(event) => setCorrectReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setCorrectTarget(null)}>Cancel</Button><Button onClick={() => void correctOrder()} disabled={commandBusy || !correctReason.trim() || !Object.values(correctQuantities).some((quantity) => quantity > 0)}>Apply correction</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={cancelTarget !== null} onOpenChange={(open) => !open && setCancelTarget(null)}><DialogContent><DialogHeader><DialogTitle>Cancel whole order</DialogTitle></DialogHeader><div className="space-y-2"><p className="text-sm text-muted-foreground">Cancellation is audited and reverses outstanding recorded stock movements. It is blocked after external settlement.</p><Textarea placeholder="Required cancellation reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setCancelTarget(null)}>Keep order</Button><Button variant="destructive" onClick={() => void cancelOrder()} disabled={commandBusy || !cancelReason.trim()}>Cancel order</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function StationTab({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{icon}{label}</button>;
}

function OrderTicket({ order, status, stationId, onMoveLine, onCorrect, onCancel }: {
  order: Order; status: BoardStatus; stationId: string;
  onMoveLine: (order: Order, line: OrderLineItem, target: BoardStatus) => void;
  onCorrect: (order: Order) => void; onCancel: (order: Order) => void;
}) {
  const lines = order.lineItems.filter((line) => line.lineStatus === status && lineMatchesStation(line, stationId));
  const canCorrect = order.lineItems.every((line) => line.lineStatus === "received");
  return <div className="space-y-3 rounded-lg border bg-background p-3 shadow-sm"><div className="flex justify-between gap-2"><div>{order.tableIdentifier && <p className="text-xs font-semibold uppercase text-muted-foreground">Table {order.tableIdentifier}</p>}<p className="text-xs text-muted-foreground">{timeAgo(order.placedAt)}</p></div><Badge variant="outline">{lines.some((line) => line.routesToAllStations) ? "Shared" : lines[0]?.preparationStationName ?? "Station"}</Badge></div><div className="space-y-3">{lines.map((line) => <div key={line.id} className="rounded-md border p-2"><div className="text-sm"><span className="font-medium">{line.quantity}×</span> {line.itemName}{line.selectedModifiers.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({line.selectedModifiers.map((modifier) => modifier.name).join(", ")})</span>}{line.notes && <p className="text-xs italic text-muted-foreground">{line.notes}</p>}</div><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" className="px-2" disabled={!PREV[status]} onClick={() => PREV[status] && onMoveLine(order, line, PREV[status]!)} aria-label={`Move ${line.itemName} back`}><ChevronLeft className="h-4 w-4" /></Button>{NEXT[status] ? <Button size="sm" className="flex-1" onClick={() => onMoveLine(order, line, NEXT[status]!)}>{NEXT[status] === "preparing" ? "Start" : NEXT[status] === "ready" ? "Ready" : "Served"}<ChevronRight className="ml-1 h-4 w-4" /></Button> : <div className="flex-1 py-1.5 text-center text-xs text-muted-foreground">Served</div>}</div></div>)}</div>{order.notes && <p className="border-t pt-2 text-xs text-muted-foreground">Note: {order.notes}</p>}<div className="flex gap-2 border-t pt-2"><Button size="sm" variant="outline" disabled={!canCorrect} title={canCorrect ? "Correct order content" : "Corrections stop once preparation begins"} onClick={() => onCorrect(order)}>Correct</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => onCancel(order)}>Cancel</Button></div></div>;
}
