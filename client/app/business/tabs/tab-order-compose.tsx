"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChefHat, Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clientGetMenu, clientAddOrderToTab } from "@/lib/client-api";
import {
  type CartItem,
  addCartEntry,
  cartItemCount,
  cartItemLineTotal,
  cartTotal,
  effectivePrice,
  modifierTotal,
  toggleModifier,
} from "@/lib/cart";
import type { Menu, MenuItem, ModifierGroup, SelectedModifier } from "@/types";
import { formatMoney } from "@/lib/money";

const money = formatMoney;

function generateIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface TabOrderComposeProps {
  businessId: string;
  tabId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called after an order is successfully added, so the parent can refresh the
  // tab's total + order list without the user hitting the manual refresh button.
  onAdded: () => void;
}

export function TabOrderCompose({
  businessId,
  tabId,
  open,
  onOpenChange,
  onAdded,
}: TabOrderComposeProps) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Item detail step (modifier selection) — swaps the dialog body in place
  // rather than nesting a second modal.
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [detailMods, setDetailMods] = useState<SelectedModifier[]>([]);
  const [detailNotes, setDetailNotes] = useState("");
  const [detailQty, setDetailQty] = useState(1);

  // Load the menu each time the dialog opens (public read → carries the
  // server-decided happy-hour state, same source as the customer menu).
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setCart([]);
    setDetailItem(null);
    clientGetMenu(businessId)
      .then(setMenu)
      .catch(() => setMenu(null))
      .finally(() => setLoading(false));
  }, [open, businessId]);

  const hhActive = menu?.happyHourActive ?? false;

  function openDetail(item: MenuItem) {
    setDetailItem(item);
    setDetailMods([]);
    setDetailNotes("");
    setDetailQty(1);
  }

  function toggleMod(
    group: ModifierGroup,
    mod: { id: string; name: string; priceDelta: number },
  ) {
    setDetailMods((prev) => toggleModifier(prev, group, mod));
  }

  function addDetailToCart() {
    if (!detailItem) return;
    setCart((prev) =>
      addCartEntry(prev, {
        item: detailItem,
        quantity: detailQty,
        selectedModifiers: detailMods,
        notes: detailNotes,
      }),
    );
    setDetailItem(null);
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await clientAddOrderToTab(tabId, {
        items: cart.map((ci) => ({
          itemId: ci.item.id,
          quantity: ci.quantity,
          selectedModifiers: ci.selectedModifiers,
          notes: ci.notes || undefined,
        })),
        idempotencyKey: generateIdempotencyKey(),
      });
      toast.success("Order added to tab");
      onAdded();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add order");
    } finally {
      setSubmitting(false);
    }
  }

  const totalItems = cartItemCount(cart);
  const totalPrice = cartTotal(cart, hhActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {detailItem ? detailItem.name : `Add order to Tab #${tabId.slice(0, 8)}`}
          </DialogTitle>
        </DialogHeader>

        {/* ─── Item detail step ─────────────────────────────────────────── */}
        {detailItem ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {detailItem.description && (
                <p className="text-sm text-muted-foreground">
                  {detailItem.description}
                </p>
              )}
              {hhActive && detailItem.happyHourPrice != null ? (
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-primary">
                    {money(Number(detailItem.happyHourPrice))}
                  </p>
                  <p className="text-sm text-muted-foreground line-through">
                    {money(Number(detailItem.price))}
                  </p>
                  <Badge variant="secondary" className="text-[10px]">
                    Happy Hour
                  </Badge>
                </div>
              ) : (
                <p className="text-base font-semibold">
                  {money(Number(detailItem.price))}
                </p>
              )}

              {detailItem.modifierGroups.map((group) => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-medium">{group.name}</p>
                    {group.required && (
                      <Badge variant="secondary" className="text-xs">
                        Required
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    {group.modifiers
                      .filter((m) => m.isAvailable)
                      .map((mod) => (
                        <div key={mod.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`mod-${mod.id}`}
                            checked={detailMods.some(
                              (m) => m.modifierId === mod.id,
                            )}
                            onCheckedChange={() =>
                              toggleMod(group, {
                                id: mod.id,
                                name: mod.name,
                                priceDelta: mod.priceDelta,
                              })
                            }
                          />
                          <Label
                            htmlFor={`mod-${mod.id}`}
                            className="flex-1 text-sm cursor-pointer"
                          >
                            {mod.name}
                          </Label>
                          {mod.priceDelta > 0 && (
                            <span className="text-xs text-muted-foreground">
                              +{money(Number(mod.priceDelta))}
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
                  value={detailNotes}
                  onChange={(e) => setDetailNotes(e.target.value)}
                  placeholder="E.g. no ice"
                />
              </div>
            </div>

            <DialogFooter className="flex-col gap-3 sm:flex-col">
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-lg font-semibold w-8 text-center">
                  {detailQty}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setDetailQty((q) => q + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDetailItem(null)}
                >
                  Back
                </Button>
                <Button className="flex-1" onClick={addDetailToCart}>
                  Add ·{" "}
                  {money(
                    (effectivePrice(detailItem, hhActive) +
                      modifierTotal(detailMods)) *
                      detailQty,
                  )}
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          /* ─── Browse + cart step ─────────────────────────────────────── */
          <>
            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Loading menu…
                </p>
              ) : !menu ? (
                <div className="text-center py-8">
                  <ChefHat className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">No menu available</p>
                </div>
              ) : (
                menu.categories
                  .filter((c) => c.isActive)
                  .map((cat) => (
                    <section key={cat.id}>
                      <h3 className="text-sm font-semibold mb-2">{cat.name}</h3>
                      <div className="space-y-2">
                        {cat.items
                          .filter((i) => i.isAvailable)
                          .map((item) => (
                            <button
                              key={item.id}
                              onClick={() => openDetail(item)}
                              className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm">
                                    {item.name}
                                  </p>
                                  {item.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  {hhActive && item.happyHourPrice != null ? (
                                    <>
                                      <p className="text-sm font-semibold text-primary">
                                        {money(Number(item.happyHourPrice))}
                                      </p>
                                      <p className="text-xs text-muted-foreground line-through">
                                        {money(Number(item.price))}
                                      </p>
                                    </>
                                  ) : (
                                    <p className="text-sm font-semibold">
                                      {money(Number(item.price))}
                                    </p>
                                  )}
                                  <Plus className="h-4 w-4 text-primary mt-1 ml-auto" />
                                </div>
                              </div>
                            </button>
                          ))}
                      </div>
                    </section>
                  ))
              )}

              {/* Cart */}
              {cart.length > 0 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-semibold mb-2">
                    Order · {totalItems} item{totalItems === 1 ? "" : "s"}
                  </p>
                  <div className="space-y-2">
                    {cart.map((ci, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg border p-2.5"
                      >
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
                            <p className="text-xs text-muted-foreground italic">
                              {ci.notes}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-semibold shrink-0">
                          {money(cartItemLineTotal(ci, hhActive))}
                        </p>
                        <button
                          onClick={() => removeFromCart(i)}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <span className="text-sm font-semibold">
                Total {money(totalPrice)}
              </span>
              <Button
                onClick={submit}
                disabled={submitting || cart.length === 0}
              >
                {submitting ? "Adding…" : "Add to tab"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
