"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  clientGetInventoryItems,
  clientCreateInventoryItem,
  clientUpdateInventoryItem,
  clientDeleteInventoryItem,
  clientRecordStockMovement,
  clientGetStockMovements,
  clientGetInventoryDiscrepancies,
  type InventoryDiscrepancy,
} from "@/lib/client-api";
import type { InventoryItem, StockMovement, WasteReason } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SkeletonList } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  POUR_PRESETS,
  UNIT_TYPE_LABELS,
  isLiquidUnitType,
  mlToOz,
  ozToMl,
  presetsForUnitType,
  type UnitType,
} from "@/lib/units";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { formatBusinessDateTime } from "@/lib/business-time";
import { formatMoney } from "@/lib/money";
import { useRegionalSettings } from "@/contexts/regional-context";

interface Props {
  businessId: string;
  businessTimezone: string;
  /** Rendered inside the inventory tab shell, which supplies the page chrome. */
  embedded?: boolean;
}

type ItemFormState = {
  name: string;
  unit: string;
  unitType: UnitType;
  containerVolumeMl: string;
  // Optional reference pour size for the pours-remaining estimate (bottle/keg).
  // Held in the currently-selected unit; converted to ml on save.
  defaultPour: string;
  defaultPourUnit: "ml" | "oz";
  parQuantity: string;
  costPerUnit: string;
  notes: string;
};

type MovementFormState = {
  movementType: "receive" | "adjust" | "waste";
  quantityDelta: string;
  // Structured cause, only used/sent for waste movements.
  reason: WasteReason;
  notes: string;
  // For a bottle/keg receive: enter number of containers instead of raw ml.
  receiveAsContainers: boolean;
  // Unit the quantity is typed in for a liquid item (ml/oz toggle, reused from
  // the recipe builder). Ignored for `each` items and container-receive mode.
  quantityUnit: "ml" | "oz";
};

// Structured waste causes (mirrors migration 021 + the backend enum). Kept
// low-cardinality so waste can be aggregated per item later (Phase 9 ML V2).
const WASTE_REASONS: { value: WasteReason; label: string }[] = [
  { value: "spillage", label: "Spillage" },
  { value: "wrong_measure", label: "Wrong measure / over-pour" },
  { value: "breakage", label: "Breakage" },
  { value: "spoilage", label: "Spoilage / expired" },
  { value: "other", label: "Other" },
];

const WASTE_REASON_LABELS: Record<WasteReason, string> = {
  spillage: "Spillage",
  wrong_measure: "Wrong measure",
  breakage: "Breakage",
  spoilage: "Spoilage",
  other: "Other",
};

const EMPTY_ITEM_FORM: ItemFormState = {
  name: "",
  unit: "each",
  unitType: "each",
  containerVolumeMl: "",
  defaultPour: "",
  defaultPourUnit: "ml",
  parQuantity: "",
  costPerUnit: "",
  notes: "",
};

const EMPTY_MOVEMENT_FORM: MovementFormState = {
  movementType: "receive",
  quantityDelta: "",
  reason: "spillage",
  notes: "",
  receiveAsContainers: true,
  quantityUnit: "ml",
};

function movementTypeLabel(type: string) {
  if (type === "receive") return "Receive";
  if (type === "waste") return "Waste";
  return "Adjust";
}

/**
 * A stock movement, in mono. NO COLOUR.
 *
 * Receiving stock was green, waste was red, adjustments amber. None of the
 * three is a severity: waste that happened an hour ago is a record, not
 * something to handle before the night ends, and green for "stock arrived" is
 * the success-tick pattern this system does not have. The sign and the movement
 * type already say which direction it went.
 */
function movementDeltaDisplay(movement: StockMovement) {
  const delta = movement.quantityDelta;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className="font-mono text-[length:var(--data-size)] font-medium tabular-nums">
      {sign}
      {delta}
    </span>
  );
}

export function InventoryManagementClient({ businessId, businessTimezone, embedded = false }: Props) {
  const { currencyCode, locale } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [discrepancies, setDiscrepancies] = useState<InventoryDiscrepancy[]>([]);

  // ── Item dialog ─────────────────────────────────────────────────────────────
  const [itemDialog, setItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM_FORM);
  const [itemSaving, setItemSaving] = useState(false);

  // ── Movement dialog ─────────────────────────────────────────────────────────
  const [movementDialog, setMovementDialog] = useState(false);
  const [movementTargetId, setMovementTargetId] = useState<string | null>(null);
  const [movementForm, setMovementForm] = useState<MovementFormState>(EMPTY_MOVEMENT_FORM);
  const [movementSaving, setMovementSaving] = useState(false);

  // ── History sheet ───────────────────────────────────────────────────────────
  const [historySheet, setHistorySheet] = useState(false);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ── Delete confirmation ─────────────────────────────────────────────────────
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const [data, openDiscrepancies] = await Promise.all([
        clientGetInventoryItems(businessId),
        clientGetInventoryDiscrepancies(businessId),
      ]);
      setItems(data);
      setDiscrepancies(openDiscrepancies);
    } catch {
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // ── Item CRUD ────────────────────────────────────────────────────────────────

  function openCreateItem() {
    setEditingItem(null);
    setItemForm(EMPTY_ITEM_FORM);
    setItemDialog(true);
  }

  function openEditItem(item: InventoryItem) {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      unit: item.unit,
      unitType: item.unitType ?? "each",
      containerVolumeMl:
        item.containerVolumeMl != null ? String(item.containerVolumeMl) : "",
      // Prefill the pour size in ml (its stored unit); staff can toggle to oz.
      defaultPour: item.defaultPourMl != null ? String(item.defaultPourMl) : "",
      defaultPourUnit: "ml",
      parQuantity: item.parQuantity != null ? String(item.parQuantity) : "",
      costPerUnit: item.costPerUnit != null ? String(item.costPerUnit) : "",
      notes: item.notes ?? "",
    });
    setItemDialog(true);
  }

  async function saveItem() {
    if (!itemForm.name.trim()) {
      toast.error("Name is required");
      return;
    }
    const isLiquid = isLiquidUnitType(itemForm.unitType);
    let containerVolumeMl: number | null = null;
    let defaultPourMl: number | null = null;
    if (isLiquid) {
      const parsed = Number(itemForm.containerVolumeMl);
      if (!itemForm.containerVolumeMl || isNaN(parsed) || parsed <= 0) {
        toast.error("Enter the container volume (ml) for a bottle/keg item");
        return;
      }
      containerVolumeMl = parsed;
      // Optional reference pour size — convert an oz entry to ml before send.
      if (itemForm.defaultPour.trim() !== "") {
        const pour = Number(itemForm.defaultPour);
        if (isNaN(pour) || pour <= 0) {
          toast.error("Default pour size must be a positive number");
          return;
        }
        defaultPourMl =
          itemForm.defaultPourUnit === "oz" ? ozToMl(pour) : pour;
      }
    }
    setItemSaving(true);
    try {
      if (editingItem) {
        const updated = await clientUpdateInventoryItem(businessId, editingItem.id, {
          name: itemForm.name.trim(),
          unit: itemForm.unit.trim() || "each",
          unitType: itemForm.unitType,
          // null clears container_volume_ml when the item is (now) 'each'.
          containerVolumeMl: isLiquid ? containerVolumeMl : null,
          // null clears the pour size (item is 'each', or the field was cleared).
          defaultPourMl: isLiquid ? defaultPourMl : null,
          parQuantity:
            itemForm.parQuantity !== "" ? Number(itemForm.parQuantity) : null,
          costPerUnit:
            itemForm.costPerUnit !== "" ? Number(itemForm.costPerUnit) : null,
          notes: itemForm.notes.trim() || null,
        });
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        toast.success("Item updated");
      } else {
        const created = await clientCreateInventoryItem(businessId, {
          name: itemForm.name.trim(),
          unit: itemForm.unit.trim() || "each",
          unitType: itemForm.unitType,
          containerVolumeMl: containerVolumeMl ?? undefined,
          defaultPourMl: defaultPourMl ?? undefined,
          parQuantity:
            itemForm.parQuantity !== "" ? Number(itemForm.parQuantity) : undefined,
          costPerUnit:
            itemForm.costPerUnit !== "" ? Number(itemForm.costPerUnit) : undefined,
          notes: itemForm.notes.trim() || undefined,
        });
        setItems((prev) => [...prev, created]);
        toast.success("Item added");
      }
      setItemDialog(false);
    } catch (e) {
      // Surface the server message (e.g. the 409 blocking a count↔ml unit_type
      // change while recipes reference the item) instead of a generic failure.
      toast.error((e as Error).message || "Failed to save item");
    } finally {
      setItemSaving(false);
    }
  }

  function deleteItem(item: InventoryItem) {
    setItemToDelete(item);
  }

  async function confirmDeleteItem(item: InventoryItem) {
    try {
      await clientDeleteInventoryItem(businessId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Item archived; movement history was preserved");
    } catch {
      toast.error("Failed to archive item");
    }
  }

  // ── Stock movements ──────────────────────────────────────────────────────────

  function openMovement(item: InventoryItem) {
    setMovementTargetId(item.id);
    setMovementForm(EMPTY_MOVEMENT_FORM);
    setMovementDialog(true);
  }

  // ml/oz toggle for the default-pour-size field — same conversion pattern, so
  // switching units re-expresses the same amount rather than reinterpreting it.
  function toggleDefaultPourUnit(nextUnit: "ml" | "oz") {
    setItemForm((f) => {
      if (f.defaultPourUnit === nextUnit) return f;
      const val = Number(f.defaultPour);
      let defaultPour = f.defaultPour;
      if (f.defaultPour !== "" && !isNaN(val)) {
        defaultPour =
          nextUnit === "oz" ? mlToOz(val).toFixed(2) : ozToMl(val).toFixed(1);
      }
      return { ...f, defaultPourUnit: nextUnit, defaultPour };
    });
  }

  // ml/oz toggle for a liquid amount — reuses the recipe-builder conversion so
  // switching units re-expresses the same amount (not a raw reinterpretation).
  function toggleMovementUnit(nextUnit: "ml" | "oz") {
    setMovementForm((f) => {
      if (f.quantityUnit === nextUnit) return f;
      const val = Number(f.quantityDelta);
      let quantityDelta = f.quantityDelta;
      if (f.quantityDelta !== "" && !isNaN(val)) {
        quantityDelta =
          nextUnit === "oz" ? mlToOz(val).toFixed(2) : ozToMl(val).toFixed(1);
      }
      return { ...f, quantityUnit: nextUnit, quantityDelta };
    });
  }

  async function saveMovement() {
    if (!movementTargetId) return;
    const target = items.find((i) => i.id === movementTargetId);
    const value = Number(movementForm.quantityDelta);
    if (!movementForm.quantityDelta || isNaN(value) || value === 0) {
      toast.error("Enter a non-zero quantity");
      return;
    }
    const targetIsLiquid = target != null && isLiquidUnitType(target.unitType);
    const liquidReceive =
      targetIsLiquid &&
      movementForm.movementType === "receive" &&
      movementForm.receiveAsContainers;
    // Convert an oz-entered liquid amount to ml before it leaves the client — the
    // backend only ever stores the native unit (ml). Container-receive is exempt.
    const useOz =
      targetIsLiquid && !liquidReceive && movementForm.quantityUnit === "oz";
    const nativeValue = useOz ? ozToMl(value) : value;
    setMovementSaving(true);
    try {
      if (liquidReceive) {
        // Enter containers; backend multiplies by container_volume_ml → ml delta.
        await clientRecordStockMovement(businessId, movementTargetId, {
          movementType: "receive",
          containerQuantity: Math.abs(value),
          notes: movementForm.notes.trim() || undefined,
        });
      } else {
        // For waste, delta should be negative (stock going out).
        const effectiveDelta =
          movementForm.movementType === "waste"
            ? -Math.abs(nativeValue)
            : nativeValue;
        await clientRecordStockMovement(businessId, movementTargetId, {
          movementType: movementForm.movementType,
          quantityDelta: effectiveDelta,
          // reason is structured + required for waste; omitted otherwise.
          reason:
            movementForm.movementType === "waste"
              ? movementForm.reason
              : undefined,
          notes: movementForm.notes.trim() || undefined,
        });
      }
      toast.success("Movement recorded");
      setMovementDialog(false);
      // Reload items to reflect updated current_quantity
      void loadItems();
    } catch {
      toast.error("Failed to record movement");
    } finally {
      setMovementSaving(false);
    }
  }

  // ── History ──────────────────────────────────────────────────────────────────

  async function openHistory(item: InventoryItem) {
    setHistoryItem(item);
    setMovements([]);
    setHistorySheet(true);
    setHistoryLoading(true);
    try {
      const data = await clientGetStockMovements(businessId, item.id);
      setMovements(data);
    } catch {
      toast.error("Failed to load history");
    } finally {
      setHistoryLoading(false);
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const lowStockItems = items.filter((i) => i.isLowStock);
  const movementTarget = items.find((i) => i.id === movementTargetId);
  const movementTargetIsLiquid = isLiquidUnitType(movementTarget?.unitType);
  // Show the ml/oz toggle on the quantity for a liquid item, except when
  // receiving by container count (where the amount is containers, not a volume).
  const showMlOzToggle =
    movementTargetIsLiquid &&
    !(movementForm.movementType === "receive" && movementForm.receiveAsContainers);
  // Live "= N ml" hint when receiving a bottle/keg by container count.
  const receiveMlPreview =
    movementTargetIsLiquid &&
    movementForm.movementType === "receive" &&
    movementForm.receiveAsContainers &&
    movementTarget?.containerVolumeMl != null &&
    movementForm.quantityDelta !== "" &&
    !isNaN(Number(movementForm.quantityDelta))
      ? Math.abs(Number(movementForm.quantityDelta)) * movementTarget.containerVolumeMl
      : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={embedded ? "flex flex-col gap-6" : "flex flex-col gap-6 px-[clamp(16px,2.5vw,32px)] py-6"}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {embedded ? (
            <h2 className="type-t2">Stock</h2>
          ) : (
            <h1 className="type-t1">Inventory</h1>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            Track stock levels and record movements
          </p>
        </div>
        {/* One size for the pair. `filter` is the 34px chip used INSIDE a filter
            bar; a screen's header actions take the default height, which is what
            every other screen's header does. */}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadItems}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
          <Button onClick={openCreateItem}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Low-stock alert strip */}
      {lowStockItems.length > 0 && (
        /* NEUTRAL, deliberately. §08 names par levels twice as the case that
           does not qualify for a severity — "a note for Tuesday's order, not an
           alarm during service". It was amber; a bartender mid-rush now sees it
           sit quietly where it belongs. */
        <div className="border-l-2 border-border-strong bg-secondary px-4 py-3">
          <p className="type-label mb-1 text-foreground">Below par</p>
          <p className="text-[length:var(--ui-size)] text-muted-foreground">
            {lowStockItems.length}{" "}
            {lowStockItems.length === 1 ? "item is" : "items are"} under par:{" "}
            {lowStockItems.map((item) => item.name).join(", ")}. One for the next
            order, not for tonight.
          </p>
        </div>
      )}

      {discrepancies.length > 0 && (
        /* A stock record that disagrees with itself is a defect in the book,
           not a service failure. It is stated plainly and prominently and takes
           the critical TEXT colour without the fill — nothing here needs
           handling in the next five minutes. */
        <div className="border-l-2 border-critical-fill bg-critical-tint px-4 py-3" role="alert">
          <p className="type-label mb-1 text-critical-text">
            {discrepancies.length === 1
              ? "One record does not add up"
              : `${discrepancies.length} records do not add up`}
          </p>
          <p className="text-[length:var(--ui-size)] text-muted-foreground">
            {discrepancies.map((incident) => incident.details).join(" · ")}
          </p>
        </div>
      )}

      {/* Item list */}
      {loading ? (
        <SkeletonList rows={6} columns={["w-[28%]", "w-[16%]", "w-[14%]", "w-[14%]", "w-[12%]"]} />
      ) : items.length === 0 ? (
        <div className="border border-dashed p-12 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">No inventory items yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add your first ingredient or stock item to get started.
          </p>
          <Button className="mt-4" onClick={openCreateItem}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Item
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            // Wrap, not scroll: a stock line's columns carry no cross-row
            // alignment worth preserving, and the defect this fixes was the
            // name truncating to two characters while the four action icons
            // ran off the edge. Below --bp-phone the row becomes a stack —
            // name and meta, then the badges and quantity, then the actions.
            // --row-content-min is what forces that break; wherever the line
            // has room the row stays on one line, so the tablet is unmoved.
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border px-4 py-3"
            >
              {/* Name + meta */}
              <div className="flex-1 min-w-[var(--row-content-min)]">
                <p className="font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.parQuantity != null
                    ? `par: ${item.parQuantity} ${item.unit}`
                    : item.unit}
                  {item.costPerUnit != null && (
                    <span className="ml-2">· {money(item.costPerUnit)}/{item.unit}</span>
                  )}
                </p>
              </div>

              {/* Pours-remaining estimate (bottle/keg with a reference pour size).
                  Rough — a generic reference size, not a recipe pour — so it's
                  explicitly labeled "(est.)" to distinguish it from the recipe-exact
                  "servings left" on menu items. */}
              {item.defaultPourMl != null && item.defaultPourMl > 0 && (
                <Badge
                  tone="neutral"
                  className="tabular-nums"
                  title={`Rough estimate from a ${item.defaultPourMl} ml reference pour — not tied to any recipe`}
                >
                  ~{Math.floor(item.currentQuantity / item.defaultPourMl)} pours left
                  (est.)
                </Badge>
              )}

              {/* Quantity badge */}
              {/* Both states neutral. Below par is a purchasing fact; the
                  badge says the words, and the quantity carries the rest. */}
              <span className="font-mono text-[length:var(--data-size)] tabular-nums">
                {item.currentQuantity} {item.unit}
              </span>
              {item.isLowStock ? <Badge tone="neutral">Below par</Badge> : null}

              {/* Actions */}
              <div className="flex gap-1 shrink-0">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Record movement"
                  onClick={() => openMovement(item)}
                >
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="View history"
                  onClick={() => openHistory(item)}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Edit item"
                  onClick={() => openEditItem(item)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Archive item"
                  onClick={() => deleteItem(item)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit Item Dialog ─────────────────────────────────────────────── */}
      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-name">Name *</Label>
              <Input
                id="inv-name"
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Olive Oil"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select
                value={itemForm.unitType}
                onValueChange={(v) =>
                  setItemForm((f) => ({ ...f, unitType: v as UnitType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="each">{UNIT_TYPE_LABELS.each}</SelectItem>
                  <SelectItem value="bottle">{UNIT_TYPE_LABELS.bottle}</SelectItem>
                  <SelectItem value="keg">{UNIT_TYPE_LABELS.keg}</SelectItem>
                </SelectContent>
              </Select>
              {isLiquidUnitType(itemForm.unitType) && (
                <p className="text-xs text-muted-foreground">
                  Stock, par level and recipes for this item are tracked in
                  milliliters (ml).
                </p>
              )}
            </div>
            {isLiquidUnitType(itemForm.unitType) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-container">Container volume (ml)</Label>
                <div className="flex gap-2">
                  <Input
                    id="inv-container"
                    type="number"
                    min="0"
                    step="1"
                    value={itemForm.containerVolumeMl}
                    onChange={(e) =>
                      setItemForm((f) => ({
                        ...f,
                        containerVolumeMl: e.target.value,
                      }))
                    }
                    placeholder="e.g. 750"
                    className="flex-1"
                  />
                  <Select
                    value=""
                    onValueChange={(v) =>
                      setItemForm((f) => ({ ...f, containerVolumeMl: v }))
                    }
                  >
                    <SelectTrigger className="w-[150px] shrink-0">
                      <SelectValue placeholder="Presets" />
                    </SelectTrigger>
                    <SelectContent>
                      {presetsForUnitType(itemForm.unitType).map((p) => (
                        <SelectItem key={p.ml} value={String(p.ml)}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Volume of one {itemForm.unitType}. Used when receiving stock by the{" "}
                  {itemForm.unitType}.
                </p>
              </div>
            )}
            {isLiquidUnitType(itemForm.unitType) && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-pour">Default pour size (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="inv-pour"
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.defaultPour}
                    onChange={(e) =>
                      setItemForm((f) => ({ ...f, defaultPour: e.target.value }))
                    }
                    placeholder="e.g. 44"
                    className="flex-1"
                  />
                  <Select
                    value={itemForm.defaultPourUnit}
                    onValueChange={(v) => toggleDefaultPourUnit(v as "ml" | "oz")}
                  >
                    <SelectTrigger className="w-[80px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      const p = POUR_PRESETS[Number(v)];
                      if (!p) return;
                      setItemForm((f) => ({
                        ...f,
                        defaultPour: String(p.value),
                        defaultPourUnit: p.unit,
                      }));
                    }}
                  >
                    <SelectTrigger className="w-[130px] shrink-0">
                      <SelectValue placeholder="Presets" />
                    </SelectTrigger>
                    <SelectContent>
                      {POUR_PRESETS.map((p, i) => (
                        <SelectItem key={p.label} value={String(i)}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Reference size for the rough “~N pours left (est.)” count. Leave
                  blank for no estimate.
                </p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-unit">Display unit label</Label>
              <Input
                id="inv-unit"
                value={itemForm.unit}
                onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder={
                  isLiquidUnitType(itemForm.unitType)
                    ? "ml"
                    : "e.g. each, kg, box"
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-par">Par level</Label>
                <Input
                  id="inv-par"
                  type="number"
                  min="0"
                  step="0.001"
                  value={itemForm.parQuantity}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, parQuantity: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="inv-cost">Cost per unit ({currencyCode})</Label>
                <Input
                  id="inv-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={itemForm.costPerUnit}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, costPerUnit: e.target.value }))
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-notes">Notes</Label>
              <Textarea
                id="inv-notes"
                value={itemForm.notes}
                onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setItemDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveItem} disabled={itemSaving}>
              {itemSaving ? "Saving…" : editingItem ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Record Movement Dialog ────────────────────────────────────────────── */}
      <Dialog open={movementDialog} onOpenChange={setMovementDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Record Movement
              {movementTarget && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  — {movementTarget.name}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select
                value={movementForm.movementType}
                onValueChange={(v) =>
                  setMovementForm((f) => ({
                    ...f,
                    movementType: v as MovementFormState["movementType"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receive">
                    <span className="flex items-center gap-2">
                      <ArrowUpCircle className="h-3.5 w-3.5" />
                      Receive (stock in)
                    </span>
                  </SelectItem>
                  <SelectItem value="waste">
                    <span className="flex items-center gap-2">
                      <ArrowDownCircle className="h-3.5 w-3.5" />
                      Waste (stock out)
                    </span>
                  </SelectItem>
                  <SelectItem value="adjust">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Adjust (manual correction)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {movementTargetIsLiquid && movementForm.movementType === "receive" && (
              <div className="flex flex-col gap-1.5">
                <Label>Enter as</Label>
                <Select
                  value={movementForm.receiveAsContainers ? "containers" : "ml"}
                  onValueChange={(v) =>
                    setMovementForm((f) => ({
                      ...f,
                      receiveAsContainers: v === "containers",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="containers">
                      Containers ({movementTarget?.unitType})
                    </SelectItem>
                    <SelectItem value="ml">Milliliters (ml)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {movementForm.movementType === "waste" && (
              <div className="flex flex-col gap-1.5">
                <Label>Reason</Label>
                <Select
                  value={movementForm.reason}
                  onValueChange={(v) =>
                    setMovementForm((f) => ({ ...f, reason: v as WasteReason }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WASTE_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-qty">
                Quantity
                {movementForm.movementType === "waste" && (
                  <span className="ml-1 text-xs text-muted-foreground">(enter positive — will be deducted)</span>
                )}
                {movementForm.movementType === "adjust" && (
                  <span className="ml-1 text-xs text-muted-foreground">(negative to reduce)</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="mv-qty"
                  type="number"
                  step="0.001"
                  value={movementForm.quantityDelta}
                  onChange={(e) =>
                    setMovementForm((f) => ({ ...f, quantityDelta: e.target.value }))
                  }
                  placeholder="e.g. 5"
                  className="flex-1"
                />
                {showMlOzToggle && (
                  <Select
                    value={movementForm.quantityUnit}
                    onValueChange={(v) => toggleMovementUnit(v as "ml" | "oz")}
                  >
                    <SelectTrigger className="w-20 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ml">ml</SelectItem>
                      <SelectItem value="oz">oz</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              {receiveMlPreview != null && (
                <p className="text-xs text-muted-foreground">
                  = {receiveMlPreview.toLocaleString()} ml
                </p>
              )}
              {showMlOzToggle && movementForm.quantityUnit === "oz" && (
                <p className="text-xs text-muted-foreground">
                  Stored in ml; entered ounces are converted on save.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mv-notes">Notes</Label>
              <Input
                id="mv-notes"
                value={movementForm.notes}
                onChange={(e) =>
                  setMovementForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMovementDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveMovement} disabled={movementSaving}>
              {movementSaving ? "Saving…" : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Movement History Sheet ────────────────────────────────────────────── */}
      <Sheet open={historySheet} onOpenChange={setHistorySheet}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {historyItem ? `${historyItem.name} — History` : "Movement History"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
            ) : (
              movements.map((m) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 border px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral" className="text-xs capitalize">
                        {movementTypeLabel(m.movementType)}
                      </Badge>
                      {m.reason && (
                        <Badge tone="neutral">
                          {WASTE_REASON_LABELS[m.reason]}
                        </Badge>
                      )}
                      {m.alertTriggered && (
                        <Badge tone="neutral">Alert sent</Badge>
                      )}
                    </div>
                    {m.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{m.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatBusinessDateTime(m.createdAt, businessTimezone, locale)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">{movementDeltaDisplay(m)}</div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={itemToDelete !== null}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title="Archive Item"
        description={`Archive "${itemToDelete?.name}"? It will leave active inventory, while its movement history remains available for audit.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() => {
          if (itemToDelete) void confirmDeleteItem(itemToDelete);
          setItemToDelete(null);
        }}
      />
    </div>
  );
}
