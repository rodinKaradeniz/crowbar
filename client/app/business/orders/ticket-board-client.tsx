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
import { ChefHat, Wine, Wifi, WifiOff, Clock, PowerOff, Power } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

const STATUS_NEXT: Record<string, Order["status"] | null> = {
  received: "preparing",
  preparing: "ready",
  ready: "served",
  served: null,
  cancelled: null,
};

const STATUS_NEXT_LABEL: Record<string, string> = {
  received: "Start Preparing",
  preparing: "Mark Ready",
  ready: "Mark Served",
};

const STATUS_COLOR: Record<string, string> = {
  received: "bg-blue-50 border-blue-200",
  preparing: "bg-amber-50 border-amber-200",
  ready: "bg-green-50 border-green-200",
};

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
    // Toast new orders
    for (const o of incoming) {
      if (!knownIdsRef.current.has(o.id)) {
        knownIdsRef.current.add(o.id);
        toast(`New order${o.tableIdentifier ? ` — Table ${o.tableIdentifier}` : ""}`, {
          description: `${o.lineItems.length} item(s) · €${Number(o.totalAmount).toFixed(2)}`,
        });
      }
    }
    setOrders(incoming);
  });

  async function advance(order: Order) {
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    // Optimistic update
    setOrders((prev) =>
      prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)),
    );
    try {
      const updated = await clientAdvanceOrderStatus(businessId, order.id, next);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (e) {
      toast.error((e as Error).message);
      // Revert
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: order.status } : o)),
      );
    }
  }

  const active = orders.filter((o) => !["served", "cancelled"].includes(o.status));
  const kitchen = active.filter((o) =>
    o.lineItems.some((li) => li.routingTag === "kitchen" || li.routingTag === "any"),
  );
  const bar = active.filter((o) =>
    o.lineItems.some((li) => li.routingTag === "bar" || li.routingTag === "any"),
  );

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <p className="text-muted-foreground">Loading orders…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live ticket board — Kitchen &amp; Bar
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

      {!isAcceptingOrders && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-center gap-2 text-sm text-destructive">
          <PowerOff className="h-4 w-4 shrink-0" />
          <span>Ordering is paused — customers cannot place new orders.</span>
        </div>
      )}

      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No active orders</p>
          <p className="text-sm text-muted-foreground mt-1">
            Orders will appear here in real-time as customers place them.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BoardColumn
            title="Kitchen"
            icon={<ChefHat className="h-4 w-4" />}
            orders={kitchen}
            routingFilter="kitchen"
            onAdvance={advance}
          />
          <BoardColumn
            title="Bar"
            icon={<Wine className="h-4 w-4" />}
            orders={bar}
            routingFilter="bar"
            onAdvance={advance}
          />
        </div>
      )}
    </div>
  );
}

// ─── Board Column ─────────────────────────────────────────────────────────────

function BoardColumn({
  title,
  icon,
  orders,
  routingFilter,
  onAdvance,
}: {
  title: string;
  icon: React.ReactNode;
  orders: Order[];
  routingFilter: "kitchen" | "bar";
  onAdvance: (order: Order) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
        <Badge variant="secondary">{orders.length}</Badge>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No active {title.toLowerCase()} orders
        </div>
      ) : (
        orders.map((order) => (
          <OrderTicket
            key={order.id}
            order={order}
            routingFilter={routingFilter}
            onAdvance={onAdvance}
          />
        ))
      )}
    </div>
  );
}

// ─── Order Ticket ─────────────────────────────────────────────────────────────

function OrderTicket({
  order,
  routingFilter,
  onAdvance,
}: {
  order: Order;
  routingFilter: "kitchen" | "bar";
  onAdvance: (order: Order) => void;
}) {
  const relevantItems = order.lineItems.filter(
    (li) => li.routingTag === routingFilter || li.routingTag === "any",
  );
  const nextStatus = STATUS_NEXT[order.status];
  const colorClass = STATUS_COLOR[order.status] ?? "bg-background";

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${colorClass}`}>
      <div className="flex items-start justify-between">
        <div>
          {order.tableIdentifier && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Table {order.tableIdentifier}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{timeAgo(order.placedAt)}</p>
        </div>
        <Badge variant="outline" className="text-xs">
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

      {nextStatus && (
        <Button
          size="sm"
          className="w-full"
          onClick={() => onAdvance(order)}
        >
          {STATUS_NEXT_LABEL[order.status]}
        </Button>
      )}
    </div>
  );
}

function LineItemRow({ item }: { item: OrderLineItem }) {
  return (
    <div className="text-sm">
      <span className="font-medium">{item.quantity}×</span>{" "}
      <span>{item.itemName}</span>
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
