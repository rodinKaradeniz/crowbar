"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clientGetMenu, clientGetOrderingSettings } from "@/lib/client-api";
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
import { NightTheme } from "@/components/night-theme";
import { formatMoney } from "@/lib/money";

interface MenuClientProps {
  businessId: string;
  businessSlug: string;
}

export default function MenuClient({ businessId, businessSlug }: MenuClientProps) {
  const searchParams = useSearchParams();
  const tableToken = searchParams.get("table_token");

  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAcceptingOrders, setIsAcceptingOrders] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);

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
        <NightTheme />
        <p className="eyebrow">Opening the menu…</p>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <NightTheme />
        <div className="text-center px-6">
          <ChefHat className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="font-display text-xl">No menu available</p>
          <p className="text-sm text-muted-foreground mt-2">This business hasn&apos;t set up their menu yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <NightTheme />

      {/* Masthead — set like the cover of a printed list */}
      <header className="px-6 pt-10 pb-6 text-center fade-rise">
        {tableToken && <p className="eyebrow text-brass mb-2">Table ordering</p>}
        <h1 className="font-display text-3xl tracking-tight">{menu.name}</h1>
        <div className="rule-double mt-5 mx-auto max-w-36" />
      </header>

      {/* Not-accepting-orders banner */}
      {!isAcceptingOrders && (
        <div className="mx-6 mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive text-center">
          Ordering is temporarily unavailable. Please check back shortly.
        </div>
      )}

      {/* Category nav */}
      <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border fade-rise" style={{ animationDelay: "80ms" }}>
        <div className="overflow-x-auto scrollbar-hide flex gap-6 px-6 py-3">
          {menu.categories.filter((c) => c.isActive).map((cat) => (
            <a
              key={cat.id}
              href={`#cat-${cat.id}`}
              className="eyebrow shrink-0 text-foreground/70 hover:text-primary border-b border-transparent hover:border-primary/60 pb-0.5 transition-colors"
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
            <section key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-16 fade-rise" style={{ animationDelay: `${Math.min(catIndex, 4) * 90 + 140}ms` }}>
              <div className="flex items-center gap-4 mb-4">
                <span className="h-px flex-1 bg-border" aria-hidden />
                <h2 className="eyebrow text-brass">{cat.name}</h2>
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
                        <span className="font-medium text-[15px] group-hover:text-primary transition-colors">
                          {item.name}
                        </span>
                        <span className="leader-dots text-brass" aria-hidden />
                        {hhActive && item.happyHourPrice != null ? (
                          <span className="shrink-0 text-right">
                            <span className="figures text-sm text-primary">
                              {formatMoney(item.happyHourPrice)}
                            </span>{" "}
                            <span className="figures text-xs text-muted-foreground line-through">
                              {formatMoney(item.price)}
                            </span>
                          </span>
                        ) : (
                          <span className="figures text-sm shrink-0">{formatMoney(item.price)}</span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-[13px] leading-relaxed text-muted-foreground mt-1 pr-10 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {hhActive && item.happyHourPrice != null && (
                          <span className="eyebrow text-primary">Happy Hour</span>
                        )}
                        {item.prepTimeMinutes && (
                          <span className="figures text-xs text-muted-foreground">
                            ~{item.prepTimeMinutes} min
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
          <div className="rule-double" />
          <div className="p-4 max-w-xl mx-auto">
            {isAcceptingOrders && tableToken ? (
              <Link
                href={`/order/${businessSlug}${tableToken ? `?table_token=${encodeURIComponent(tableToken)}` : ""}`}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem(`cart_${businessSlug}`, JSON.stringify(cart));
                    // Carry the server-decided happy-hour state to the checkout
                    // page so its running total matches the menu display.
                    sessionStorage.setItem(`cart_hh_${businessSlug}`, JSON.stringify(hhActive));
                  }
                }}
              >
                <Button className="w-full" size="lg">
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  View Cart · {totalItems} item{totalItems !== 1 ? "s" : ""} ·{" "}
                  <span className="figures">{formatMoney(totalPrice)}</span>
                </Button>
              </Link>
            ) : (
              <Button className="w-full" size="lg" disabled>
                <ShoppingCart className="h-5 w-5 mr-2" />
                {isAcceptingOrders ? "Scan your table QR to order" : "Ordering unavailable"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Item detail sheet */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto border-t-brass/40">
          {selectedItem && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="font-display text-xl font-normal">{selectedItem.name}</SheetTitle>
                {selectedItem.description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{selectedItem.description}</p>
                )}
                {hhActive && selectedItem.happyHourPrice != null ? (
                  <div className="flex items-baseline gap-2">
                    <p className="figures text-base text-primary">
                      {formatMoney(selectedItem.happyHourPrice)}
                    </p>
                    <p className="figures text-sm text-muted-foreground line-through">
                      {formatMoney(selectedItem.price)}
                    </p>
                    <span className="eyebrow text-primary">Happy Hour</span>
                  </div>
                ) : (
                  <p className="figures text-base">{formatMoney(selectedItem.price)}</p>
                )}
              </SheetHeader>

              <div className="space-y-5 mt-4">
                {selectedItem.modifierGroups.map((group) => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2.5">
                      <p className="eyebrow">{group.name}</p>
                      {group.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
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
                            <span className="figures text-xs text-muted-foreground">
                              +{formatMoney(mod.priceDelta)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div>
                  <Label className="eyebrow">Special request (optional)</Label>
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
                    variant="outline"
                    size="icon"
                    onClick={() => setSheetQty((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="figures text-lg w-8 text-center">{sheetQty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSheetQty((q) => q + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button className="w-full" onClick={addToCart}>
                  Add to Cart ·{" "}
                  <span className="figures">
                    {formatMoney(
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
