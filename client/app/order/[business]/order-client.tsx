"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clientPlaceOrder, clientGetOrderStatus } from "@/lib/client-api";
import type { Order } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, ShoppingCart, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";

const STATUS_LABEL: Record<string, string> = {
  received: "Order received",
  preparing: "Being prepared",
  ready: "Ready!",
  served: "Served",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  received: "bg-blue-100 text-blue-800",
  preparing: "bg-amber-100 text-amber-800",
  ready: "bg-green-100 text-green-800",
  served: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-800",
};

interface CartItem {
  item: { id: string; name: string; price: number; routingTag: string };
  quantity: number;
  selectedModifiers: Array<{ modifierId: string; name: string; priceDelta: number }>;
  notes: string;
}

function generateIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface OrderClientProps {
  businessId: string;
  businessSlug: string;
}

export default function OrderClient({ businessId, businessSlug }: OrderClientProps) {
  const searchParams = useSearchParams();
  const table = searchParams.get("table");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableInput, setTableInput] = useState(table ?? "");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);

  // Post-order state
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(`cart_${businessSlug}`);
      if (stored) {
        try {
          setCart(JSON.parse(stored) as CartItem[]);
        } catch {}
      }
    }
  }, [businessSlug]);

  // Poll order status every 10s after placing
  useEffect(() => {
    if (!sessionToken) return;
    setPolling(true);
    const id = setInterval(() => {
      clientGetOrderStatus(businessId, sessionToken)
        .then(setOrders)
        .catch(() => {});
    }, 10_000);
    return () => {
      clearInterval(id);
      setPolling(false);
    };
  }, [businessId, sessionToken]);

  function removeItem(index: number) {
    const next = cart.filter((_, i) => i !== index);
    setCart(next);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(`cart_${businessSlug}`, JSON.stringify(next));
    }
  }

  const totalPrice = cart.reduce((sum, ci) => {
    const modTotal = ci.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);
    return sum + (ci.item.price + modTotal) * ci.quantity;
  }, 0);

  async function placeOrder() {
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      const order = await clientPlaceOrder(businessId, {
        tableIdentifier: tableInput.trim() || undefined,
        items: cart.map((ci) => ({
          itemId: ci.item.id,
          quantity: ci.quantity,
          selectedModifiers: ci.selectedModifiers,
          notes: ci.notes || undefined,
        })),
        notes: notes.trim() || undefined,
        idempotencyKey: generateIdempotencyKey(),
      });
      setSessionToken(order.sessionToken);
      setOrders([order]);
      setCart([]);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`cart_${businessSlug}`);
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  // ─── Post-order status view ───────────────────────────────────────────────────

  if (sessionToken) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-md mx-auto">
        <div className="text-center mb-6">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
          <h1 className="text-xl font-semibold">Order placed!</h1>
          <p className="text-sm text-muted-foreground mt-1">
            We&apos;ll update this page as your order progresses.
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Clock className="h-4 w-4 animate-spin" />
            Loading status…
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Order{order.tableIdentifier ? ` · Table ${order.tableIdentifier}` : ""}
                </p>
                <Badge className={`text-xs ${STATUS_COLOR[order.status] ?? ""}`}>
                  {STATUS_LABEL[order.status] ?? order.status}
                </Badge>
              </div>
              <div className="space-y-1">
                {order.lineItems.map((li) => (
                  <p key={li.id} className="text-sm">
                    {li.quantity}× {li.itemName}
                    {li.selectedModifiers.length > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({li.selectedModifiers.map((m) => m.name).join(", ")})
                      </span>
                    )}
                  </p>
                ))}
              </div>
              <p className="text-sm font-semibold border-t pt-2">
                Total: €{Number(order.totalAmount).toFixed(2)}
              </p>
            </div>
          ))
        )}

        {polling && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Auto-refreshing every 10 seconds…
          </p>
        )}

        <div className="mt-6">
          <Link href={`/menu/${businessSlug}${table ? `?table=${encodeURIComponent(table)}` : ""}`}>
            <Button variant="outline" className="w-full">
              Order more
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Cart view ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-2">
        <Link href={`/menu/${businessSlug}${table ? `?table=${encodeURIComponent(table)}` : ""}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to menu
        </Link>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Your order</h1>
        </div>

        {cart.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground text-sm">Your cart is empty.</p>
            <Link href={`/menu/${businessSlug}${table ? `?table=${encodeURIComponent(table)}` : ""}`}>
              <Button variant="outline" className="mt-3">Browse menu</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {cart.map((ci, i) => {
                const modTotal = ci.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);
                const lineTotal = (ci.item.price + modTotal) * ci.quantity;
                return (
                  <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {ci.quantity}× {ci.item.name}
                      </p>
                      {ci.selectedModifiers.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {ci.selectedModifiers.map((m) => m.name).join(", ")}
                        </p>
                      )}
                      {ci.notes && (
                        <p className="text-xs text-muted-foreground italic">{ci.notes}</p>
                      )}
                    </div>
                    <p className="text-sm font-semibold shrink-0">€{lineTotal.toFixed(2)}</p>
                    <button
                      onClick={() => removeItem(i)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Table number (optional)</Label>
                <Input
                  value={tableInput}
                  onChange={(e) => setTableInput(e.target.value)}
                  placeholder="e.g. 4"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Order notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, special requests…"
                />
              </div>
            </div>

            <div className="fixed bottom-0 inset-x-0 p-4 bg-background border-t">
              <div className="max-w-md mx-auto">
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">€{totalPrice.toFixed(2)}</span>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={placeOrder}
                  disabled={placing || cart.length === 0}
                >
                  {placing ? "Placing order…" : "Place Order"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
