"use client";

import { useEffect, useState } from "react";
import {
  clientGetCurrentTableSession,
  clientPlaceOrder,
  clientGetOrderStatus,
} from "@/lib/client-api";
import type { Order } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import { useRegionalSettings } from "@/contexts/regional-context";

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
  // Brand, not a success colour: "ready" means the bar is holding it for
  // you, which is the live-and-healthy channel, not good news about a number.
  ready: "bg-primary/20 text-primary",
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
    taxRate?: number;
    priceIncludesTax?: boolean;
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
  const { currencyCode, locale, taxLabel } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  const [cart, setCart] = useState<CartItem[]>([]);
  // Happy-hour state carried from the menu page (server-decided). Display only —
  // the backend re-decides authoritatively at order placement.
  const [hhActive, setHhActive] = useState(false);
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  // Age self-attestation (only surfaced when the cart contains an alcoholic item).
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  // Post-order state
  const [placed, setPlaced] = useState(false);
  const [tableApproved, setTableApproved] = useState(false);
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

  useEffect(() => {
    void clientGetCurrentTableSession(businessId)
      .then((session) => setTableApproved(session.status === "approved"))
      .catch(() => setTableApproved(false));
  }, [businessId]);

  // Poll order status every 10s after placing
  useEffect(() => {
    if (!placed) return;
    setPolling(true);
    const id = setInterval(() => {
      clientGetOrderStatus(businessId)
        .then(setOrders)
        .catch(() => {});
    }, 10_000);
    return () => {
      clearInterval(id);
      setPolling(false);
    };
  }, [businessId, placed]);

  function removeItem(index: number) {
    const next = cart.filter((_, i) => i !== index);
    setCart(next);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(`cart_${businessSlug}`, JSON.stringify(next));
    }
  }

  const effectivePrice = (item: CartItem["item"]) =>
    hhActive && item.happyHourPrice != null ? item.happyHourPrice : item.price;

  const currencyDigits = new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode })
    .resolvedOptions().maximumFractionDigits;
  const roundCurrency = (value: number) => Number(value.toFixed(currencyDigits));
  const cartTotals = cart.reduce((totals, ci) => {
    const modTotal = ci.selectedModifiers.reduce((sum, modifier) => sum + modifier.priceDelta, 0);
    const entered = roundCurrency((effectivePrice(ci.item) + modTotal) * ci.quantity);
    const rate = (ci.item.taxRate ?? 0) / 100;
    const includes = ci.item.priceIncludesTax ?? true;
    const net = includes && rate > 0 ? roundCurrency(entered / (1 + rate)) : entered;
    const tax = includes ? roundCurrency(entered - net) : roundCurrency(net * rate);
    return { subtotal: totals.subtotal + net, tax: totals.tax + tax, total: totals.total + net + tax };
  }, { subtotal: 0, tax: 0, total: 0 });
  const totalPrice = roundCurrency(cartTotals.total);

  // Whether the cart contains any alcoholic item. Gates the attestation step and
  // is re-validated server-side at placement (the backend is authoritative).
  const cartHasAlcohol = cart.some((ci) => ci.item.isAlcoholic);

  async function placeOrder() {
    if (cart.length === 0) return;
    if (cartHasAlcohol && !ageConfirmed) return;
    if (!tableApproved) {
      toast.error("Ask a staff member to approve ordering for this table.");
      return;
    }
    setPlacing(true);
    try {
      const order = await clientPlaceOrder(businessId, {
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
      setPlaced(true);
      setOrders([order]);
      setCart([]);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`cart_${businessSlug}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  // ─── Post-order status view ───────────────────────────────────────────────────

  if (placed) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-md mx-auto">
        <div className="text-center mb-8 enter-rise">
          <CheckCircle2 className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="type-t1">Order placed</h1>
          <p className="text-sm text-muted-foreground mt-2">
            We&apos;ll update this page as your order progresses.
          </p>
        </div>

        {orders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            Loading status…
          </div>
        ) : (
          orders.map((order, orderIndex) => (
            <div key={`${order.placedAt}-${orderIndex}`} className="border bg-card p-5 space-y-4 enter-rise" style={{ animationDelay: "120ms" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="type-label text-muted-foreground">
                  Order
                </p>
                <span
                  className={cn(
                    "type-label text-muted-foreground rounded-full px-2.5 py-1",
                    STATUS_COLOR[order.status] ?? "bg-muted text-muted-foreground",
                    order.status === "ready" && "live-pulse",
                  )}
                >
                  {STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <div className="space-y-2">
                {order.lineItems.map((li, lineIndex) => (
                  <div key={`${li.itemName}-${lineIndex}`} className="flex items-baseline gap-2.5 text-sm">
                    <span className="font-mono tabular-nums text-muted-foreground shrink-0">{li.quantity}×</span>
                    <span>{li.itemName}</span>
                    {li.selectedModifiers.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({li.selectedModifiers.map((m) => m.name).join(", ")})
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-border" />
              <div className="flex items-baseline gap-2.5 text-xs text-muted-foreground">
                <span>Operational {taxLabel}</span>
                <span className="flex-1" aria-hidden />
                <span className="font-mono tabular-nums">{money(order.taxAmount)}</span>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="type-label text-muted-foreground">Total</span>
                <span className="flex-1" aria-hidden />
                <span className="font-mono tabular-nums text-base">{money(order.totalAmount)}</span>
              </div>
            </div>
          ))
        )}

        {polling && (
          <p className="font-mono tabular-nums text-center text-xs text-muted-foreground mt-5">
            Auto-refreshing every 10 seconds…
          </p>
        )}

        <div className="mt-8">
          <Link href={`/menu/${businessSlug}`}>
            <Button variant="secondary" className="w-full">
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
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-6 py-3 flex items-center gap-2">
        <Link href={`/menu/${businessSlug}`}
          className="type-label text-muted-foreground hover:text-primary transition-colors"
        >
          ← Back to menu
        </Link>
      </div>

      <div className="px-6 py-8 max-w-md mx-auto space-y-8">
        <div className="text-center enter-rise">
          <h1 className="type-t1">Your order</h1>
          <div className="border-t border-border mt-4 mx-auto max-w-36" />
        </div>

        {cart.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground text-sm">Your cart is empty.</p>
            <Link href={`/menu/${businessSlug}`}>
              <Button variant="secondary" className="mt-4">Browse menu</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/60 enter-rise" style={{ animationDelay: "90ms" }}>
              {cart.map((ci, i) => {
                const modTotal = ci.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);
                const lineTotal = (effectivePrice(ci.item) + modTotal) * ci.quantity;
                return (
                  <div key={i} className="flex items-start gap-3 py-3.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2.5">
                        <span className="text-sm font-medium">
                          <span className="font-mono tabular-nums text-muted-foreground">{ci.quantity}×</span> {ci.item.name}
                        </span>
                        <span className="flex-1" aria-hidden />
                        <span className="font-mono tabular-nums text-sm shrink-0">{money(lineTotal)}</span>
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

            <div className="space-y-4 enter-rise" style={{ animationDelay: "160ms" }}>
              {!tableApproved && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">Ask a staff member to approve ordering for this table.</p>}
              <div className="space-y-1.5">
                <Label className="type-label text-muted-foreground">Order notes (optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Allergies, special requests…"
                />
              </div>
            </div>

            <div className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur">
              <div className="border-t border-border" />
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
                <div className="mb-2 flex items-baseline gap-2.5 text-xs text-muted-foreground">
                  <span>Estimated {taxLabel} (non-fiscal)</span>
                  <span className="flex-1" aria-hidden />
                  <span className="font-mono tabular-nums">{money(roundCurrency(cartTotals.tax))}</span>
                </div>
                <div className="flex items-baseline gap-2.5 mb-3">
                  <span className="type-label text-muted-foreground">Total</span>
                  <span className="flex-1" aria-hidden />
                  <span className="font-mono tabular-nums text-base">{money(totalPrice)}</span>
                </div>
                <Button
                  className="w-full"
                  size="md"
                  onClick={placeOrder}
                  disabled={
                    placing ||
                    cart.length === 0 ||
                    !tableApproved ||
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
