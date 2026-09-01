"use client";

import { useEffect, useState } from "react";
import {
  clientCreateTableSession,
  clientGetCurrentTableSession,
  clientGetMenu,
  clientGetOrderingSettings,
} from "@/lib/client-api";
import type { Menu, MenuItem, ModifierGroup, SelectedModifier } from "@/types";
import {
  type CartItem,
  addCartEntry,
  cartItemCount,
  cartTotal,
  effectivePrice,
  modifierTotal,
  toggleModifier,
} from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Plus, Minus, ChefHat } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { useRegionalSettings } from "@/contexts/regional-context";

interface MenuClientProps {
  businessId: string;
  businessSlug: string;
}

export default function MenuClient({ businessId, businessSlug }: MenuClientProps) {
  const { currencyCode, locale, taxLabel } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableSessionStatus, setTableSessionStatus] = useState<string | null>(null);

  // Item detail sheet
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [sheetMods, setSheetMods] = useState<SelectedModifier[]>([]);
  const [sheetNotes, setSheetNotes] = useState("");
  const [sheetQty, setSheetQty] = useState(1);

  useEffect(() => {
    void clientGetOrderingSettings(businessId)
      .then((s) => setIsAcceptingOrders(s.isAcceptingOrders))
      .catch(() => {});

    clientGetMenu(businessId)
      .then(setMenu)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  useEffect(() => {
    let cancelled = false;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const tableToken = fragment.get("table_token");
    if (tableToken) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    const nonceKey = `crowbar-table-browser-${businessId}`;
    let nonce = localStorage.getItem(nonceKey);
    if (!nonce) {
      nonce = crypto.randomUUID();
      localStorage.setItem(nonceKey, nonce);
    }
    const bootstrap = tableToken
      ? clientCreateTableSession(businessId, tableToken, nonce)
      : clientGetCurrentTableSession(businessId);
    void bootstrap
      .then((session) => { if (!cancelled) setTableSessionStatus(session.status); })
      .catch(() => { if (!cancelled) setTableSessionStatus(null); });
    return () => { cancelled = true; };
  }, [businessId]);

  useEffect(() => {
    if (tableSessionStatus !== "pending") return;
    const id = window.setInterval(() => {
      void clientGetCurrentTableSession(businessId)
        .then((session) => setTableSessionStatus(session.status))
        .catch(() => setTableSessionStatus(null));
    }, 5_000);
    return () => window.clearInterval(id);
  }, [businessId, tableSessionStatus]);

  function openItem(item: MenuItem) {
    setSelectedItem(item);
    setSheetMods([]);
    setSheetNotes("");
    setSheetQty(1);
  }

  function toggleMod(group: ModifierGroup, mod: { id: string; name: string; priceDelta: number }) {
    setSheetMods((prev) => toggleModifier(prev, group, mod));
  }

  function addToCart() {
    if (!selectedItem) return;
    setCart((prev) =>
      addCartEntry(prev, {
        item: selectedItem,
        quantity: sheetQty,
        selectedModifiers: sheetMods,
        notes: sheetNotes,
      }),
    );
    setSelectedItem(null);
  }

  // Happy hour is decided server-side (menu.happyHourActive). When active, an
  // item with happyHourPrice set is displayed and totalled at the lower price.
  const hhActive = menu?.happyHourActive ?? false;

  const totalItems = cartItemCount(cart);
  const totalPrice = cartTotal(cart, hhActive);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="type-label text-muted-foreground">Opening the menu…</p>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center px-6">
          <ChefHat className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="type-t1">No menu available</p>
          <p className="text-sm text-muted-foreground mt-2">This business hasn&apos;t set up their menu yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">

      {/* Masthead — set like the cover of a printed list */}
      <header className="px-6 pt-10 pb-6 text-center enter-rise">
        {tableSessionStatus && <p className="type-label text-muted-foreground mb-2">Table ordering</p>}
        <h1 className="type-d3">{menu.name}</h1>
        <div className="border-t border-border mt-5 mx-auto max-w-36" />
      </header>

      {/* Not-accepting-orders banner */}
      {!isAcceptingOrders && (
        <div className="mx-6 mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive text-center">
          Ordering is temporarily unavailable. Please check back shortly.
        </div>
      )}

      {/* Category nav */}
      <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border enter-rise" style={{ animationDelay: "80ms" }}>
        <div className="overflow-x-auto scrollbar-hide flex gap-6 px-6 py-3">
          {menu.categories.filter((c) => c.isActive).map((cat) => (
            <a
              key={cat.id}
              href={`#cat-${cat.id}`}
              className="type-label text-muted-foreground shrink-0 text-foreground/70 hover:text-primary border-b border-transparent hover:border-primary/60 pb-0.5 transition-colors"
            >
              {cat.name}
            </a>
          ))}
        </div>
      </nav>

      {/* Menu items */}
      <div className="px-6 space-y-10 mt-8 max-w-xl mx-auto">
        {menu.categories
          .filter((c) => c.isActive)
          .map((cat, catIndex) => (
            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-16 enter-rise" style={{ animationDelay: `${Math.min(catIndex, 4) * 90 + 140}ms` }}>
              <div className="flex items-center gap-4 mb-4">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <h2 className="type-label text-muted-foreground">{cat.name}</h2>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <div className="divide-y divide-border/60">
                {cat.items
                  .filter((i) => i.isAvailable)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => openItem(item)}
                      className="group w-full text-left py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <div className="flex items-baseline gap-2.5">
                        <span className="min-w-0 font-medium text-[15px] group-hover:text-primary transition-colors">
                          {item.name}
                        </span>
                        <span className="flex-1" aria-hidden />
                        {hhActive && item.happyHourPrice != null ? (
                          <span className="shrink-0 text-right">
                            <span className="font-mono tabular-nums text-sm text-primary">
                              {money(item.happyHourPrice)}
                            </span>{" "}
                            <span className="font-mono tabular-nums text-xs text-muted-foreground line-through">
                              {money(item.price)}
                            </span>
                          </span>
                        ) : (
                          <span className="font-mono tabular-nums text-sm shrink-0">{money(item.price)}</span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[13px] leading-relaxed text-muted-foreground mt-1 pr-10 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {hhActive && item.happyHourPrice != null && (
                          <span className="type-label text-muted-foreground text-primary">Happy Hour</span>
                        )}
                        {item.prepTimeMinutes && (
                          <span className="font-mono tabular-nums text-xs text-muted-foreground">
                            ~{item.prepTimeMinutes} min
                          </span>
                        )}
                        {item.taxProfileName && (
                          <span className="text-[11px] text-muted-foreground">
                            {item.priceIncludesTax ? `incl. ${taxLabel}` : `plus ${taxLabel}`} · {item.taxRate}% {item.taxProfileName}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            </section>
          ))}
      </div>

      {/* Cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur">
          <div className="border-t border-border" />
          <div className="p-4 max-w-xl mx-auto">
            {isAcceptingOrders && tableSessionStatus === "approved" ? (
              <Link
                href={`/order/${businessSlug}`}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem(`cart_${businessSlug}`, JSON.stringify(cart));
                    // Carry the server-decided happy-hour state to the checkout
                    // page so its running total matches the menu display.
                    sessionStorage.setItem(`cart_hh_${businessSlug}`, JSON.stringify(hhActive));
                  }
                }}
              >
                <Button className="w-full" size="md">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  View Cart · {totalItems} item{totalItems !== 1 ? "s" : ""} ·{" "}
                  <span className="font-mono tabular-nums">{money(totalPrice)}</span>
                </Button>
              </Link>
            ) : (
              <Button className="w-full" size="md" disabled>
                <ShoppingCart className="h-5 w-5 mr-2" />
                {isAcceptingOrders
                  ? tableSessionStatus === "pending"
                    ? "Waiting for staff approval"
                    : "Scan your table QR to order"
                  : "Ordering unavailable"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Item detail sheet */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="type-t1 font-normal">{selectedItem.name}</SheetTitle>
                {selectedItem.description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{selectedItem.description}</p>
                )}
                {hhActive && selectedItem.happyHourPrice != null ? (
                  <div className="flex items-baseline gap-2">
                    <p className="font-mono tabular-nums text-base text-primary">
                      {money(selectedItem.happyHourPrice)}
                    </p>
                    <p className="font-mono tabular-nums text-sm text-muted-foreground line-through">
                      {money(selectedItem.price)}
                    </p>
                    <span className="type-label text-muted-foreground text-primary">Happy Hour</span>
                  </div>
                ) : (
                  <p className="font-mono tabular-nums text-base">{money(selectedItem.price)}</p>
                )}
              </SheetHeader>

              <div className="space-y-5 mt-4 px-[var(--space-16)]">
                {selectedItem.modifierGroups.map((group) => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <p className="type-label text-muted-foreground">{group.name}</p>
                      {group.required && <Badge tone="neutral" className="text-xs">Required</Badge>}
                    </div>
                    <div className="space-y-2.5">
                      {group.modifiers.filter((m) => m.isAvailable).map((mod) => (
                        <div key={mod.id} className="flex items-center gap-2.5">
                          <Checkbox
                            id={mod.id}
                            checked={sheetMods.some((m) => m.modifierId === mod.id)}
                            onCheckedChange={() =>
                              toggleMod(group, { id: mod.id, name: mod.name, priceDelta: mod.priceDelta })
                            }
                          />
                          <Label htmlFor={mod.id} className="flex-1 text-sm cursor-pointer">
                            {mod.name}
                          </Label>
                          {mod.priceDelta > 0 && (
                            <span className="font-mono tabular-nums text-xs text-muted-foreground">
                              +{money(mod.priceDelta)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div>
                  <Label className="type-label text-muted-foreground">Special request (optional)</Label>
                  <Textarea
                    className="mt-2"
                    rows={2}
                    value={sheetNotes}
                    onChange={(e) => setSheetNotes(e.target.value)}
                    placeholder="E.g. no onions"
                  />
                </div>
              </div>

              <SheetFooter className="mt-4 flex-col gap-3">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setSheetQty((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center font-mono tabular-nums text-[length:var(--t1-size)]">{sheetQty}</span>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setSheetQty((q) => q + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button className="w-full" onClick={addToCart}>
                  Add to Cart ·{" "}
                  <span className="font-mono tabular-nums">
                    {money(
                      (effectivePrice(selectedItem, hhActive) +
                        modifierTotal(sheetMods)) *
                      sheetQty,
                    )}
                  </span>
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
