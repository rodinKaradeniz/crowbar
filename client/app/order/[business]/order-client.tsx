"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clientPlaceOrder, clientGetOrderStatus } from "@/lib/client-api";
import type { Order } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { NightTheme } from "@/components/night-theme";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  received: "Order received",
  preparing: "Being prepared",
  ready: "Ready!",
  served: "Served",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  received: "bg-secondary text-foreground",
  preparing: "bg-primary/15 text-primary",
  ready: "bg-[#5f9c7e]/25 text-[#8ecbaa]",
  served: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

interface CartItem {
  item: {
    id: string;
    name: string;
    price: number;
    happyHourPrice?: number | null;
    isAlcoholic?: boolean;
    routingTag: string;
  };
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
  legalDrinkingAge: number;
}

export default function OrderClient({ businessId, businessSlug, legalDrinkingAge }: OrderClientProps) {
  const searchParams = useSearchParams();
  const tableToken = searchParams.get("table_token");

  const [cart, setCart] = useState<CartItem[]>([]);
  // Happy-hour state carried from the menu page (server-decided). Display only —
  // the backend re-decides authoritatively at order placement.
  const [hhActive, setHhActive] = useState(false);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  // Age self-attestation (only surfaced when the cart contains an alcoholic item).
  const [ageConfirmed, setAgeConfirmed] = useState(false);

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
      const hh = sessionStorage.getItem(`cart_hh_${businessSlug}`);
      if (hh) {
        try {
          setHhActive(JSON.parse(hh) as boolean);
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

  const effectivePrice = (item: CartItem["item"]) =>
    hhActive && item.happyHourPrice != null ? item.happyHourPrice : item.price;

  const totalPrice = cart.reduce((sum, ci) => {
    const modTotal = ci.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);
    return sum + (effectivePrice(ci.item) + modTotal) * ci.quantity;
  }, 0);

  // Whether the cart contains any alcoholic item. Gates the attestation step and
  // is re-validated server-side at placement (the backend is authoritative).
  const cartHasAlcohol = cart.some((ci) => ci.item.isAlcoholic);

  async function placeOrder() {
    if (cart.length === 0) return;
    if (cartHasAlcohol && !ageConfirmed) return;
    if (!tableToken) {
      alert("Scan the QR code on your table to place an order.");
      return;
    }
    setPlacing(true);
    try {
      const order = await clientPlaceOrder(businessId, {
        tableToken,
        items: cart.map((ci) => ({
          itemId: ci.item.id,
          quantity: ci.quantity,
          selectedModifiers: ci.selectedModifiers,
          notes: ci.notes || undefined,
        })),
        notes: notes.trim() || undefined,
        idempotencyKey: generateIdempotencyKey(),
        ageConfirmed: cartHasAlcohol ? ageConfirmed : undefined,
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
        <NightTheme />
        <div className="text-center mb-8 fade-rise">
          <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="font-display text-2xl">Order placed</h1>
          <p className="text-sm text-muted-foreground mt-2">
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
            <div key={order.id} className="rounded-lg border bg-card p-5 space-y-4 fade-rise" style={{ animationDelay: "120ms" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">
                  Order
                </p>
                <span
                  className={cn(
                    "eyebrow rounded-full px-2.5 py-1",
                    STATUS_COLOR[order.status] ?? "bg-muted text-muted-foreground",
                    order.status === "ready" && "glow-pulse",
                  )}
                >
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <div className="space-y-2">
                {order.lineItems.map((li) => (
                  <div key={li.id} className="flex items-baseline gap-2.5 text-sm">
                    <span className="figures text-muted-foreground shrink-0">{li.quantity}×</span>
                    <span>{li.itemName}</span>
                    {li.selectedModifiers.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({li.selectedModifiers.map((m) => m.name).join(", ")})
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="rule-double" />
              <div className="flex items-baseline gap-2.5">
                <span className="eyebrow">Total</span>
                <span className="leader-dots text-brass" aria-hidden />
                <span className="figures text-base">€{Number(order.totalAmount).toFixed(2)}</span>
              </div>
            </div>
          ))
        )}

        {polling && (
          <p className="figures text-center text-xs text-muted-foreground mt-5">
            Auto-refreshing every 10 seconds…
          </p>
        )}

        <div className="mt-8">
          <Link href={`/menu/${businessSlug}${tableToken ? `?table_token=${encodeURIComponent(tableToken)}` : ""}`}>
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
    <div className="min-h-screen bg-background pb-32">
      <NightTheme />
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-3 flex items-center gap-2">
        <Link href={`/menu/${businessSlug}${tableToken ? `?table_token=${encodeURIComponent(tableToken)}` : ""}`}
          className="eyebrow text-muted-foreground hover:text-primary transition-colors"
        >
          ← Back to menu
        </Link>
      </div>

      <div className="px-6 py-8 max-w-md mx-auto space-y-8">
        <div className="text-center fade-rise">
          <h1 className="font-display text-2xl">Your order</h1>
          <div className="rule-double mt-4 mx-auto max-w-36" />
        </div>

        {cart.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground text-sm">Your cart is empty.</p>
            <Link href={`/menu/${businessSlug}${tableToken ? `?table_token=${encodeURIComponent(tableToken)}` : ""}`}>
              <Button variant="outline" className="mt-4">Browse menu</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/60 fade-rise" style={{ animationDelay: "90ms" }}>
              {cart.map((ci, i) => {
                const modTotal = ci.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);
                const lineTotal = (effectivePrice(ci.item) + modTotal) * ci.quantity;
                return (
                  <div key={i} className="flex items-start gap-3 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2.5">
                        <span className="text-sm font-medium">
                          <span className="figures text-muted-foreground">{ci.quantity}×</span> {ci.item.name}
                        </span>
                        <span className="leader-dots text-brass" aria-hidden />
                        <span className="figures text-sm shrink-0">€{lineTotal.toFixed(2)}</span>
                      </div>
                      {ci.selectedModifiers.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {ci.selectedModifiers.map((m) => m.name).join(", ")}
                        </p>
                      )}
                      {ci.notes && (
                        <p className="text-xs text-muted-foreground italic mt-0.5">{ci.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(i)}
                      className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      aria-label={`Remove ${ci.item.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="space-y-4 fade-rise" style={{ animationDelay: "160ms" }}>
              {!tableToken && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">Scan the QR code on your table to place this order.</p>}
              <div className="space-y-1.5">
                <Label className="eyebrow">Order notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, special requests…"
                />
              </div>
            </div>

            <div className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur">
              <div className="rule-double" />
              <div className="p-4 max-w-md mx-auto">
                {cartHasAlcohol && (
                  <label className="flex items-start gap-2.5 mb-3 rounded-md border bg-muted/40 p-3 text-sm cursor-pointer">
                    <Checkbox
                      checked={ageConfirmed}
                      onCheckedChange={(v) => setAgeConfirmed(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      This order contains alcohol. I confirm I am at least{" "}
                      {legalDrinkingAge} years old.
                    </span>
                  </label>
                )}
                <div className="flex items-baseline gap-2.5 mb-3">
                  <span className="eyebrow">Total</span>
                  <span className="leader-dots text-brass" aria-hidden />
                  <span className="figures text-base">€{totalPrice.toFixed(2)}</span>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={placeOrder}
                  disabled={
                    placing ||
                    cart.length === 0 ||
                    !tableToken ||
                    (cartHasAlcohol && !ageConfirmed)
                  }
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
