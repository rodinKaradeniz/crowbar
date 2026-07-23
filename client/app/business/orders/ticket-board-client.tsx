"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  clientGetOrders,
  clientAdvanceOrderStatus,
  clientGetOrderingSettings,
  clientSetOrderingSettings,
} from "@/lib/client-api";
import { useOrderSocket } from "@/hooks/use-order-socket";
import type { Order, OrderLineItem } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChefHat,
  Wine,
  Wifi,
  WifiOff,
  Clock,
  PowerOff,
  Power,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutGrid,
} from "lucide-react";

// ─── Status model (Kanban columns are the primary axis) ───────────────────────

const STATUS_COLUMNS = ["received", "preparing", "ready", "served"] as const;
type BoardStatus = (typeof STATUS_COLUMNS)[number];

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

// Forward advance and previous-step-only backward move. Moving backward out of
// 'served' reverses the recipe inventory deduction server-side; every other step
// has no inventory side effect (see order_service.advance_order_status).
const STATUS_NEXT: Record<BoardStatus, BoardStatus | null> = {
  received: "preparing",
  preparing: "ready",
  ready: "served",
  served: null,
};
const STATUS_PREV: Record<BoardStatus, BoardStatus | null> = {
  received: null,
  preparing: "received",
  ready: "preparing",
  served: "ready",
};
const STATUS_NEXT_LABEL: Record<string, string> = {
  received: "Start Preparing",
  preparing: "Mark Ready",
  ready: "Mark Served",
};

const COLUMN_ACCENT: Record<BoardStatus, string> = {
  received: "border-t-blue-400",
  preparing: "border-t-amber-400",
  ready: "border-t-green-400",
  served: "border-t-muted-foreground/40",
};

// ─── Station filter (a filter toggle, NOT a second grid axis) ──────────────────

type Station = "all" | "kitchen" | "bar";

function itemMatchesStation(li: OrderLineItem, station: Station): boolean {
  if (station === "all") return true;
  return li.routingTag === station || li.routingTag === "any";
}

function stationItems(order: Order, station: Station): OrderLineItem[] {
  return order.lineItems.filter((li) => itemMatchesStation(li, station));
}

function orderInStation(order: Order, station: Station): boolean {
  if (station === "all") return true;
  return order.lineItems.some((li) => itemMatchesStation(li, station));
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

interface Props {
  businessId: string;
}

export function TicketBoardClient({ businessId }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [togglingOrders, setTogglingOrders] = useState(false);
  const [station, setStation] = useState<Station>("all");
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [, tick] = useState(0);

  // Refresh time-ago display every 30s
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    void clientGetOrderingSettings(businessId)
      .then((s) => setIsAcceptingOrders(s.isAcceptingOrders))
      .catch(() => {});

    clientGetOrders(businessId)
      .then((data) => {
        setOrders(data);
        data.forEach((o) => knownIdsRef.current.add(o.id));
      })
      .catch(() => toast.error("Failed to load orders"))
      .finally(() => setLoading(false));
  }, [businessId]);

  async function toggleAcceptingOrders() {
    setTogglingOrders(true);
    try {
      const result = await clientSetOrderingSettings(businessId, !isAcceptingOrders);
      setIsAcceptingOrders(result.isAcceptingOrders);
      toast.success(result.isAcceptingOrders ? "Now accepting orders" : "Orders paused");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTogglingOrders(false);
    }
  }

  const { connected } = useOrderSocket(businessId, (incoming) => {
    // Toast genuinely new orders (not moves of ones we already know about).
    for (const o of incoming) {
      if (!knownIdsRef.current.has(o.id)) {
        knownIdsRef.current.add(o.id);
        toast(`New order${o.tableIdentifier ? ` — Table ${o.tableIdentifier}` : ""}`, {
          description: `${o.lineItems.length} item(s) · €${o.totalAmount.toFixed(2)}`,
        });
      }
    }
    setOrders(incoming);
  });

  async function move(order: Order, target: BoardStatus) {
    const previous = order.status;
    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: target } : o)),
    );
    try {
      const updated = await clientAdvanceOrderStatus(businessId, order.id, target);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (e) {
      toast.error((e as Error).message);
      // Revert
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: previous } : o)),
      );
    }
  }

  const visible = orders.filter(
    (o) =>
      (STATUS_COLUMNS as readonly string[]).includes(o.status) &&
      orderInStation(o, station),
  );
  const byStatus = (s: BoardStatus) => visible.filter((o) => o.status === s);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-muted-foreground">Loading orders…</p>
      </div>
    );
  }

  return (
    <div className="page-pad space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live ticket board — move tickets across statuses
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={isAcceptingOrders ? "outline" : "destructive"}
            size="sm"
            onClick={toggleAcceptingOrders}
            disabled={togglingOrders}
          >
            {isAcceptingOrders ? (
              <>
                <PowerOff className="h-3.5 w-3.5 mr-1.5" />
                Pause Orders
              </>
            ) : (
              <>
                <Power className="h-3.5 w-3.5 mr-1.5" />
                Resume Orders
              </>
            )}
          </Button>
          <div className="flex items-center gap-1.5 text-sm">
            {connected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Reconnecting…</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Station filter — filters which tickets are visible, same column view. */}
      <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
        <StationTab active={station === "all"} onClick={() => setStation("all")} icon={<LayoutGrid className="h-3.5 w-3.5" />} label="All" />
        <StationTab active={station === "kitchen"} onClick={() => setStation("kitchen")} icon={<ChefHat className="h-3.5 w-3.5" />} label="Kitchen" />
        <StationTab active={station === "bar"} onClick={() => setStation("bar")} icon={<Wine className="h-3.5 w-3.5" />} label="Bar" />
      </div>

      {!isAcceptingOrders && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-center gap-2 text-sm text-destructive">
          <PowerOff className="h-4 w-4 shrink-0" />
          <span>Ordering is paused — customers cannot place new orders.</span>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No orders to show</p>
          <p className="text-sm text-muted-foreground mt-1">
            {station === "all"
              ? "Orders will appear here in real-time as customers place them."
              : `No ${station} orders right now.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUS_COLUMNS.map((s) => (
            <StatusColumn
              key={s}
              status={s}
              orders={byStatus(s)}
              station={station}
              onMove={move}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Station filter tab ────────────────────────────────────────────────────────

function StationTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Status column ─────────────────────────────────────────────────────────────

function StatusColumn({
  status,
  orders,
  station,
  onMove,
}: {
  status: BoardStatus;
  orders: Order[];
  station: Station;
  onMove: (order: Order, target: BoardStatus) => void;
}) {
  return (
    <div className={`rounded-lg border border-t-4 bg-muted/20 p-3 space-y-3 ${COLUMN_ACCENT[status]}`}>
      <div className="flex items-center gap-2">
        <h2 className="font-semibold text-sm uppercase tracking-wide">
          {STATUS_LABEL[status]}
        </h2>
        <Badge variant="secondary">{orders.length}</Badge>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
          Empty
        </div>
      ) : (
        orders.map((order) => (
          <OrderTicket
            key={order.id}
            order={order}
            station={station}
            onMove={onMove}
          />
        ))
      )}
    </div>
  );
}

// ─── Order ticket ──────────────────────────────────────────────────────────────

function OrderTicket({
  order,
  station,
  onMove,
}: {
  order: Order;
  station: Station;
  onMove: (order: Order, target: BoardStatus) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const status = order.status as BoardStatus;
  const relevantItems = stationItems(order, station);
  const nextStatus = STATUS_NEXT[status];
  const prevStatus = STATUS_PREV[status];
  const history = order.statusTimeline ?? [];

  return (
    <div className="rounded-lg border bg-background p-3 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          {order.tableIdentifier && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Table {order.tableIdentifier}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{timeAgo(order.placedAt)}</p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {STATUS_LABEL[order.status]}
        </Badge>
      </div>

      <div className="space-y-1">
        {relevantItems.map((li) => (
          <LineItemRow key={li.id} item={li} />
        ))}
      </div>

      {order.notes && (
        <p className="text-xs text-muted-foreground border-t pt-2">Note: {order.notes}</p>
      )}

      {/* Move controls: back one step (left) + advance (right). */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="px-2"
          disabled={!prevStatus}
          onClick={() => prevStatus && onMove(order, prevStatus)}
          title={prevStatus ? `Back to ${STATUS_LABEL[prevStatus]}` : undefined}
          aria-label={prevStatus ? `Back to ${STATUS_LABEL[prevStatus]}` : "No earlier status"}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {nextStatus ? (
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onMove(order, nextStatus)}
          >
            {STATUS_NEXT_LABEL[order.status]}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <div className="flex-1 text-center text-xs text-muted-foreground py-1.5">
            Served
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="border-t pt-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <History className="h-3 w-3" />
            History ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1">
              {history.map((h) => (
                <li key={h.id} className="text-xs text-muted-foreground">
                  {h.fromStatus
                    ? `${STATUS_LABEL[h.fromStatus] ?? h.fromStatus} → ${STATUS_LABEL[h.status] ?? h.status}`
                    : `${STATUS_LABEL[h.status] ?? h.status} (placed)`}
                  <span className="ml-1 opacity-70">· {timeAgo(h.changedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function LineItemRow({ item }: { item: OrderLineItem }) {
  return (
    <div className="text-sm">
      <span className="font-medium">{item.quantity}×</span>{" "}
      <span>{item.itemName}</span>
      {item.isAlcoholic && (
        <span
          className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 align-middle"
          title="Contains alcohol — check ID"
        >
          <Wine className="h-2.5 w-2.5" />
          Alcohol
        </span>
      )}
      {item.selectedModifiers.length > 0 && (
        <span className="text-xs text-muted-foreground ml-1">
          ({item.selectedModifiers.map((m) => m.name).join(", ")})
        </span>
      )}
      {item.notes && (
        <span className="text-xs text-muted-foreground ml-1 italic">— {item.notes}</span>
      )}
    </div>
  );
}
