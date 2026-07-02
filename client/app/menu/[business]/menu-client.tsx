"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { clientGetMenu, clientGetOrderingSettings } from "@/lib/client-api";
import type { Menu, MenuItem, ModifierGroup, SelectedModifier } from "@/types";
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

interface CartItem {
  item: MenuItem;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  notes: string;
}

interface MenuClientProps {
  businessId: string;
  businessSlug: string;
}

export default function MenuClient({ businessId, businessSlug }: MenuClientProps) {
  const searchParams = useSearchParams();
  const table = searchParams.get("table");

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
    setSheetMods((prev) => {
      const exists = prev.some((m) => m.modifierId === mod.id);
      if (exists) return prev.filter((m) => m.modifierId !== mod.id);
      const groupSelected = prev.filter((m) =>
        group.modifiers.some((gm) => gm.id === m.modifierId),
      );
      if (groupSelected.length >= group.maxSelect) {
        const firstId = groupSelected[0].modifierId;
        return [...prev.filter((m) => m.modifierId !== firstId), {
          modifierId: mod.id,
          name: mod.name,
          priceDelta: mod.priceDelta,
        }];
      }
      return [...prev, { modifierId: mod.id, name: mod.name, priceDelta: mod.priceDelta }];
    });
  }

  function addToCart() {
    if (!selectedItem) return;
    setCart((prev) => {
      const existing = prev.find(
        (ci) =>
          ci.item.id === selectedItem.id &&
          JSON.stringify(ci.selectedModifiers) === JSON.stringify(sheetMods) &&
          ci.notes === sheetNotes,
      );
      if (existing) {
        return prev.map((ci) =>
          ci === existing ? { ...ci, quantity: ci.quantity + sheetQty } : ci,
        );
      }
      return [...prev, { item: selectedItem, quantity: sheetQty, selectedModifiers: sheetMods, notes: sheetNotes }];
    });
    setSelectedItem(null);
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const totalItems = cart.reduce((sum, ci) => sum + ci.quantity, 0);
  const totalPrice = cart.reduce((sum, ci) => {
    const modTotal = ci.selectedModifiers.reduce((s, m) => s + m.priceDelta, 0);
    return sum + (ci.item.price + modTotal) * ci.quantity;
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading menu…</p>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <ChefHat className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No menu available</p>
          <p className="text-sm text-muted-foreground mt-1">This business hasn&apos;t set up their menu yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <h1 className="text-lg font-semibold">{menu.name}</h1>
        {table && (
          <p className="text-sm text-muted-foreground">Table {table}</p>
        )}
      </div>

      {/* Not-accepting-orders banner */}
      {!isAcceptingOrders && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2.5 text-sm text-destructive font-medium text-center">
          Ordering is temporarily unavailable. Please check back shortly.
        </div>
      )}

      {/* Category nav */}
      <div className="overflow-x-auto flex gap-2 px-4 py-3 border-b">
        {menu.categories.filter((c) => c.isActive).map((cat) => (
          <a
            key={cat.id}
            href={`#cat-${cat.id}`}
            className="shrink-0 text-sm px-3 py-1 rounded-full border hover:bg-muted transition-colors"
          >
            {cat.name}
          </a>
        ))}
      </div>

      {/* Menu items */}
      <div className="px-4 space-y-8 mt-4">
        {menu.categories
          .filter((c) => c.isActive)
          .map((cat) => (
            <section key={cat.id} id={`cat-${cat.id}`}>
              <h2 className="text-base font-semibold mb-3">{cat.name}</h2>
              <div className="space-y-2">
                {cat.items
                  .filter((i) => i.isAvailable)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => openItem(item)}
                      className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                          {item.prepTimeMinutes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              ~{item.prepTimeMinutes} min
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold">€{Number(item.price).toFixed(2)}</p>
                          <Plus className="h-4 w-4 text-primary mt-1 ml-auto" />
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            </section>
          ))}
      </div>

      {/* Cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-background border-t">
          {isAcceptingOrders ? (
            <Link
              href={`/order/${businessSlug}${table ? `?table=${encodeURIComponent(table)}` : ""}`}
              onClick={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem(`cart_${businessSlug}`, JSON.stringify(cart));
                }
              }}
            >
              <Button className="w-full" size="lg">
                <ShoppingCart className="h-5 w-5 mr-2" />
                View Cart · {totalItems} item{totalItems !== 1 ? "s" : ""} · €{totalPrice.toFixed(2)}
              </Button>
            </Link>
          ) : (
            <Button className="w-full" size="lg" disabled>
              <ShoppingCart className="h-5 w-5 mr-2" />
              Ordering unavailable
            </Button>
          )}
        </div>
      )}

      {/* Item detail sheet */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          {selectedItem && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{selectedItem.name}</SheetTitle>
                {selectedItem.description && (
                  <p className="text-sm text-muted-foreground">{selectedItem.description}</p>
                )}
                <p className="text-base font-semibold">€{Number(selectedItem.price).toFixed(2)}</p>
              </SheetHeader>

              <div className="space-y-4 mt-4">
                {selectedItem.modifierGroups.map((group) => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-medium">{group.name}</p>
                      {group.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                    </div>
                    <div className="space-y-2">
                      {group.modifiers.filter((m) => m.isAvailable).map((mod) => (
                        <div key={mod.id} className="flex items-center gap-2">
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
                            <span className="text-xs text-muted-foreground">
                              +€{Number(mod.priceDelta).toFixed(2)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div>
                  <Label className="text-sm">Special request (optional)</Label>
                  <Textarea
                    className="mt-1.5"
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
                  <span className="text-lg font-semibold w-8 text-center">{sheetQty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSheetQty((q) => q + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button className="w-full" onClick={addToCart}>
                  Add to Cart · €{(
                    (Number(selectedItem.price) +
                      sheetMods.reduce((s, m) => s + m.priceDelta, 0)) *
                    sheetQty
                  ).toFixed(2)}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
