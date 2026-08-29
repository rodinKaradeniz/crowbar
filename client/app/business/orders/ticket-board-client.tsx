"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { OfflineBar } from "@/components/offline-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonRow } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useRegionalSettings } from "@/contexts/regional-context";
import { useOrderSocket } from "@/hooks/use-order-socket";
import { useServiceClock } from "@/hooks/use-service-clock";
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
import { cn } from "@/lib/utils";
import type {
  Order,
  OrderAllDayCount,
  OrderLineItem,
  PreparationStation,
} from "@/types";

const STATUSES = ["received", "preparing", "ready", "served"] as const;
type BoardStatus = (typeof STATUSES)[number];

const LABELS: Record<string, string> = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};
const NEXT: Record<BoardStatus, BoardStatus | null> = {
  received: "preparing",
  preparing: "ready",
  ready: "served",
  served: null,
};
const PREV: Record<BoardStatus, BoardStatus | null> = {
  received: null,
  preparing: "received",
  ready: "preparing",
  served: "ready",
};

/**
 * The ticket board.
 *
 * SEVERITY, AND WHAT CHANGED HERE. This screen carried more misapplied colour
 * than any other:
 *
 * · A lost connection was drawn in AMBER. Under the rank it is CRITICAL — one
 *   of only four cases — and it now gets the persistent offline bar. A board
 *   that quietly stops updating is worse than no board.
 * · The four columns were topped with blue / amber / green rules. A workflow
 *   position is not a severity: nothing about "preparing" needs handling before
 *   "received" does. The columns are now ruled and unpainted, and read by
 *   position and heading.
 * · "Cancel" was a red-texted button on every ticket. Severity describes the
 *   item, never the control that resolves it — the red belongs in the
 *   confirmation, on the choice that cannot be undone, not on the row.
 * · "Ordering is paused" was drawn as a failure. It is a state a manager chose
 *   deliberately; it is loud by position and weight, and takes no hue.
 *
 * Ticket AGE is shown and left neutral. No target time is stored anywhere in
 * the product, so "past target" — the one critical case this board would
 * otherwise own — is not derivable. Recorded in `docs/TODO.md` §7a.
 */
export function TicketBoardClient({ businessId }: { businessId: string }) {
  const { currencyCode, locale } = useRegionalSettings();
  const { now } = useServiceClock(30_000);

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

  const refresh = useCallback(async () => {
    try {
      const [nextOrders, nextStations, nextCounts, settings] = await Promise.all([
        clientGetOrders(businessId),
        clientGetPreparationStations(),
        clientGetOrderAllDayCounts(),
        clientGetOrderingSettings(businessId),
      ]);
      setOrders(nextOrders);
      setStations(nextStations.filter((station) => station.isActive));
      setCounts(nextCounts);
      setIsAcceptingOrders(settings.isAcceptingOrders);
      nextOrders.forEach((order) => knownIds.current.add(order.id));
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load the board",
      );
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { connected, lastContactAt } = useOrderSocket(businessId, (incoming) => {
    incoming.forEach((order) => {
      if (!knownIds.current.has(order.id)) {
        knownIds.current.add(order.id);
        toast(
          `New order${order.tableIdentifier ? ` — Table ${order.tableIdentifier}` : ""}`,
          {
            description: `${order.lineItems.length} line(s) · ${formatMoney(order.totalAmount, currencyCode, locale)}`,
          },
        );
      }
    });
    setOrders(incoming);
    void clientGetOrderAllDayCounts().then(setCounts).catch(() => {});
  });

  useEffect(() => {
    if (connected) void refresh();
  }, [connected, refresh]);

  async function toggleAcceptingOrders() {
    setTogglingOrders(true);
    try {
      const result = await clientSetOrderingSettings(businessId, !isAcceptingOrders);
      setIsAcceptingOrders(result.isAcceptingOrders);
      toast.success(
        result.isAcceptingOrders ? "Now accepting orders" : "Ordering paused",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not change ordering",
      );
    } finally {
      setTogglingOrders(false);
    }
  }

  async function moveLine(order: Order, line: OrderLineItem, target: BoardStatus) {
    const previous = orders;
    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? {
              ...item,
              lineItems: item.lineItems.map((candidate) =>
                candidate.id === line.id
                  ? { ...candidate, lineStatus: target }
                  : candidate,
              ),
            }
          : item,
      ),
    );
    try {
      const updated = await clientAdvanceOrderLineStatus(
        businessId,
        order.id,
        line.id,
        target,
      );
      setOrders((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setCounts(await clientGetOrderAllDayCounts());
    } catch (error) {
      setOrders(previous);
      toast.error(
        error instanceof Error ? error.message : "Could not move the line",
      );
    }
  }

  function openCorrection(order: Order) {
    setCorrectTarget(order);
    setCorrectReason("");
    setCorrectQuantities(
      Object.fromEntries(order.lineItems.map((line) => [line.id, line.quantity])),
    );
  }

  async function correctOrder() {
    if (!correctTarget || !correctReason.trim()) return;
    setCommandBusy(true);
    try {
      const updated = await clientCorrectOrder(businessId, correctTarget.id, {
        items: correctTarget.lineItems
          .filter((line) => correctQuantities[line.id] > 0 && line.itemId)
          .map((line) => ({
            itemId: line.itemId!,
            quantity: correctQuantities[line.id],
            notes: line.notes,
            selectedModifiers: line.selectedModifiers.map((modifier) => ({
              modifierId: modifier.modifierId,
            })),
          })),
        notes: correctTarget.notes,
        reason: correctReason.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      setOrders((current) =>
        current.map((order) => (order.id === updated.id ? updated : order)),
      );
      setCorrectTarget(null);
      toast.success("Order corrected and repriced from current authority.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not correct the order",
      );
    } finally {
      setCommandBusy(false);
    }
  }

  async function cancelOrder() {
    if (!cancelTarget || !cancelReason.trim()) return;
    setCommandBusy(true);
    try {
      const updated = await clientCancelOrder(
        businessId,
        cancelTarget.id,
        cancelReason.trim(),
        crypto.randomUUID(),
      );
      setOrders((current) =>
        current.map((order) => (order.id === updated.id ? updated : order)),
      );
      setCancelTarget(null);
      setCancelReason("");
      toast.success("Order cancelled. Outstanding stock movements reversed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not cancel the order",
      );
    } finally {
      setCommandBusy(false);
    }
  }

  const visibleCounts = counts.filter(
    (count) =>
      stationId === "all" ||
      count.routesToAllStations ||
      count.preparationStationId === stationId,
  );

  return (
    <>
      {/* The one alarm. A live board that has lost its connection is one of the
          four exhaustive critical cases; it is never a toast and never
          self-dismisses. */}
      <OfflineBar
        connected={connected}
        lastContactAt={lastContactAt}
        surface="This board"
        onRetry={() => void refresh()}
      />

      <div className="px-[clamp(16px,2.5vw,32px)] py-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="type-t1">Tickets</h1>
            <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">
              Each preparation line moves on its own.
            </p>
          </div>

          <Button
            variant="secondary"
            size="filter"
            onClick={() => void toggleAcceptingOrders()}
            disabled={togglingOrders}
          >
            {isAcceptingOrders ? "Pause ordering" : "Resume ordering"}
          </Button>
        </div>

        {/* Loud by position and weight, not by hue: a manager switched this
            off on purpose, and a deliberate setting is not a failure. */}
        {!isAcceptingOrders ? (
          <div className="mb-6 border-l-2 border-primary bg-secondary px-4 py-3">
            <p className="type-label mb-1 text-foreground">Ordering is paused</p>
            <p className="text-[length:var(--ui-size)] text-muted-foreground">
              Guests cannot place new rounds from the QR menu. Tickets already on
              the board are unaffected.
            </p>
          </div>
        ) : null}

        {loadError ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 border-l-2 border-critical-fill bg-critical-tint px-4 py-3">
            <p className="flex-1 text-[length:var(--ui-size)] text-critical-text">
              {loadError}
            </p>
            <Button variant="secondary" size="filter" onClick={() => void refresh()}>
              Retry
            </Button>
          </div>
        ) : null}

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <StationTab
            active={stationId === "all"}
            onClick={() => setStationId("all")}
            label="All stations"
          />
          {stations.map((station) => (
            <StationTab
              key={station.id}
              active={stationId === station.id}
              onClick={() => setStationId(station.id)}
              label={station.name}
            />
          ))}
        </div>

        {visibleCounts.length > 0 ? (
          <section className="mb-6 border-t border-border-strong pt-3">
            <p className="type-micro mb-2 text-muted-foreground">All-day counts</p>
            <div className="flex flex-wrap gap-2">
              {visibleCounts.map((count, index) => (
                <Badge
                  key={`${count.preparationStationId}-${count.itemName}-${count.lineStatus}-${index}`}
                  tone="neutral"
                >
                  {count.quantity}× {count.itemName} ·{" "}
                  {LABELS[count.lineStatus] ?? count.lineStatus}
                  {count.routesToAllStations ? " · Shared" : ""}
                </Badge>
              ))}
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {STATUSES.map((status, column) => (
              <div key={status}>
                <p className="type-micro border-b border-border-strong pb-2 text-muted-foreground">
                  {LABELS[status]}
                </p>
                {[0, 1].map((row) => (
                  <SkeletonRow
                    key={row}
                    index={column * 2 + row}
                    columns={["w-1/3", "w-1/2"]}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          // The whole board empty is one state, not four empty columns plus a
          // panel underneath saying the same thing.
          <EmptyState
            title="No tickets tonight"
            description="Orders from the QR menu and from a server's tablet land here the moment they are placed, in the order they arrived."
            action={{ label: "Open the menu", href: "/business/menu" }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {STATUSES.map((status) => {
              const statusOrders = orders.filter(
                (order) =>
                  order.status !== "cancelled" &&
                  order.lineItems.some(
                    (line) =>
                      line.lineStatus === status &&
                      lineMatchesStation(line, stationId),
                  ),
              );

              return (
                <section key={status}>
                  <div className="mb-3 flex items-center gap-2 border-b border-border-strong pb-2">
                    <h2 className="type-micro flex-1 text-muted-foreground">
                      {LABELS[status]}
                    </h2>
                    {statusOrders.length > 0 ? (
                      <Badge tone="neutral">{statusOrders.length}</Badge>
                    ) : null}
                  </div>

                  {statusOrders.length === 0 ? (
                    <p className="py-6 text-center text-[length:var(--ui-size)] text-text-on-ink-faint">
                      Nothing here
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {statusOrders.map((order) => (
                        <OrderTicket
                          key={order.id}
                          order={order}
                          status={status}
                          stationId={stationId}
                          now={now}
                          onMoveLine={moveLine}
                          onCorrect={openCorrection}
                          onCancel={(target) => {
                            setCancelTarget(target);
                            setCancelReason("");
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

      </div>

      <Dialog
        open={correctTarget !== null}
        onOpenChange={(open) => !open && setCorrectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct this order?</DialogTitle>
            <DialogDescription>
              Content can only change before any line starts preparation. The
              server prices the corrected order again from current authority.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {correctTarget?.lineItems.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3">
                <span className="text-[length:var(--ui-size)]">{line.itemName}</span>
                <Input
                  className="w-24"
                  type="number"
                  min={0}
                  value={correctQuantities[line.id] ?? line.quantity}
                  onChange={(event) =>
                    setCorrectQuantities((current) => ({
                      ...current,
                      [line.id]: Number(event.target.value),
                    }))
                  }
                />
              </div>
            ))}
            <div>
              <Label htmlFor="correction-reason" className="mb-[7px]">
                Why
              </Label>
              <Textarea
                id="correction-reason"
                placeholder="What changed, in a few words"
                value={correctReason}
                onChange={(event) => setCorrectReason(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCorrectTarget(null)}>
              Leave it
            </Button>
            <Button
              onClick={() => void correctOrder()}
              disabled={
                commandBusy ||
                !correctReason.trim() ||
                !Object.values(correctQuantities).some((quantity) => quantity > 0)
              }
            >
              Apply correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancel the whole order for{" "}
              {cancelTarget?.tableIdentifier
                ? `Table ${cancelTarget.tableIdentifier}`
                : "this table"}
              ?
            </DialogTitle>
            <DialogDescription>
              All {cancelTarget?.lineItems.length} lines come off the board and
              any stock already deducted goes back. It is recorded against your
              name and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="cancel-reason" className="mb-[7px]">
              Why
            </Label>
            <Textarea
              id="cancel-reason"
              placeholder="Required — this is audited"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </div>

          <DialogFooter>
            {/* The safe choice is the filled one; the risky choice is a quiet
                outline in red text. §06. */}
            <Button onClick={() => setCancelTarget(null)}>Keep the order</Button>
            <Button
              variant="destructive-quiet"
              onClick={() => void cancelOrder()}
              disabled={commandBusy || !cancelReason.trim()}
            >
              Cancel the order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function lineMatchesStation(line: OrderLineItem, stationId: string) {
  return (
    stationId === "all" ||
    line.routesToAllStations ||
    line.preparationStationId === stationId
  );
}

/** A filter control at the declared 34px filter height. */
function StationTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "type-label h-[var(--control-desktop-min)] rounded-[var(--radius-3)] border px-3 transition-colors",
        active
          ? "border-border-strong bg-accent text-foreground"
          : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function OrderTicket({
  order,
  status,
  stationId,
  now,
  onMoveLine,
  onCorrect,
  onCancel,
}: {
  order: Order;
  status: BoardStatus;
  stationId: string;
  now: number;
  onMoveLine: (order: Order, line: OrderLineItem, target: BoardStatus) => void;
  onCorrect: (order: Order) => void;
  onCancel: (order: Order) => void;
}) {
  const lines = order.lineItems.filter(
    (line) => line.lineStatus === status && lineMatchesStation(line, stationId),
  );
  const canCorrect = order.lineItems.every((line) => line.lineStatus === "received");

  return (
    <article className="border border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-surface-3 px-3 py-2.5">
        <div className="min-w-0">
          {order.tableIdentifier ? (
            <p className="type-label text-foreground">
              Table {order.tableIdentifier}
            </p>
          ) : null}
          {/* Age, in neutral. Colouring it would claim a target the product
              does not store — see the header comment. */}
          <p className="mt-0.5 font-mono text-[11.5px] tabular-nums text-muted-foreground">
            {formatAge(now - new Date(order.placedAt).getTime())}
          </p>
        </div>
        <Badge tone="neutral">
          {lines.some((line) => line.routesToAllStations)
            ? "Shared"
            : (lines[0]?.preparationStationName ?? "Station")}
        </Badge>
      </div>

      <div className="flex flex-col">
        {lines.map((line) => (
          <div key={line.id} className="border-b border-surface-3 px-3 py-2.5">
            <p className="text-[length:var(--ui-size)]">
              <span className="font-mono font-semibold">{line.quantity}×</span>{" "}
              {line.itemName}
              {line.selectedModifiers.length > 0 ? (
                <span className="ml-1 text-[13px] text-muted-foreground">
                  ({line.selectedModifiers.map((modifier) => modifier.name).join(", ")})
                </span>
              ) : null}
            </p>
            {line.notes ? (
              // A dietary or preparation note is neutral. It is information the
              // bartender needs, not an alarm — §08 names it explicitly.
              <p className="mt-1 text-[13px] text-muted-foreground">{line.notes}</p>
            ) : null}

            <div className="mt-2.5 flex gap-2">
              <Button
                size="icon-sm"
                variant="secondary"
                disabled={!PREV[status]}
                onClick={() => PREV[status] && onMoveLine(order, line, PREV[status]!)}
                aria-label={`Move ${line.itemName} back`}
              >
                <ChevronLeft />
              </Button>
              {NEXT[status] ? (
                /* A standard primary, even on a late ticket. Severity describes
                   the item, never the control that resolves it. */
                <Button
                  size="filter"
                  className="flex-1"
                  onClick={() => onMoveLine(order, line, NEXT[status]!)}
                >
                  {NEXT[status] === "preparing"
                    ? "Start"
                    : NEXT[status] === "ready"
                      ? "Ready"
                      : "Served"}
                  <ChevronRight />
                </Button>
              ) : (
                <span className="type-label flex flex-1 items-center justify-center text-text-on-ink-faint">
                  Served
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {order.notes ? (
        <p className="border-b border-surface-3 px-3 py-2 text-[13px] text-muted-foreground">
          Note: {order.notes}
        </p>
      ) : null}

      <div className="flex gap-2 px-3 py-2.5">
        <Button
          size="filter"
          variant="secondary"
          disabled={!canCorrect}
          title={
            canCorrect
              ? "Change what was ordered"
              : "Corrections stop once preparation begins"
          }
          onClick={() => onCorrect(order)}
        >
          Correct
        </Button>
        {/* Not red. The item is not in trouble; only the confirmation is. */}
        <Button size="filter" variant="secondary" onClick={() => onCancel(order)}>
          Cancel
        </Button>
      </div>
    </article>
  );
}

/** m:ss under an hour, then h:mm. A duration, never a clock time. */
function formatAge(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")} h`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
