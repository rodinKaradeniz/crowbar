// Shared cart logic for the ordering flows.
//
// Both the public menu/checkout (menu/[business]/menu-client.tsx) and the
// staff-facing "add order to tab" compose UI (business/tabs) build a cart the
// same way — same modifier-selection rules, same line/total math — so that
// logic lives here rather than being duplicated per surface.
//
// An item carries exactly one price. A discount is an item sitting in a
// windowed menu at a lower price, and WHICH menus a guest can order from is
// decided server-side; these helpers never reason about that.

import type { MenuItem, ModifierGroup, SelectedModifier } from "@/types";

export interface CartItem {
  item: MenuItem;
  quantity: number;
  selectedModifiers: SelectedModifier[];
  notes: string;
}

// Toggle a modifier within its group. Selecting past the group's maxSelect
// evicts the oldest selection in that group (single-select groups swap).
export function toggleModifier(
  current: SelectedModifier[],
  group: ModifierGroup,
  mod: { id: string; name: string; priceDelta: number },
): SelectedModifier[] {
  const exists = current.some((m) => m.modifierId === mod.id);
  if (exists) return current.filter((m) => m.modifierId !== mod.id);
  const groupSelected = current.filter((m) =>
    group.modifiers.some((gm) => gm.id === m.modifierId),
  );
  if (groupSelected.length >= group.maxSelect) {
    const firstId = groupSelected[0].modifierId;
    return [
      ...current.filter((m) => m.modifierId !== firstId),
      { modifierId: mod.id, name: mod.name, priceDelta: mod.priceDelta },
    ];
  }
  return [
    ...current,
    { modifierId: mod.id, name: mod.name, priceDelta: mod.priceDelta },
  ];
}

export function modifierTotal(mods: SelectedModifier[]): number {
  return mods.reduce((s, m) => s + m.priceDelta, 0);
}

export function cartItemLineTotal(ci: CartItem): number {
  return (ci.item.price + modifierTotal(ci.selectedModifiers)) * ci.quantity;
}

export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, ci) => sum + cartItemLineTotal(ci), 0);
}

export function cartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, ci) => sum + ci.quantity, 0);
}

// Merge an entry into the cart, combining with an identical existing line
// (same item + same modifiers + same notes) by bumping its quantity.
export function addCartEntry(cart: CartItem[], entry: CartItem): CartItem[] {
  const existing = cart.find(
    (ci) =>
      ci.item.id === entry.item.id &&
      JSON.stringify(ci.selectedModifiers) ===
        JSON.stringify(entry.selectedModifiers) &&
      ci.notes === entry.notes,
  );
  if (existing) {
    return cart.map((ci) =>
      ci === existing
        ? { ...ci, quantity: ci.quantity + entry.quantity }
        : ci,
    );
  }
  return [...cart, entry];
}
