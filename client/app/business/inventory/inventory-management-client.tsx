"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  clientGetInventoryItems,
  clientCreateInventoryItem,
  clientUpdateInventoryItem,
  clientDeleteInventoryItem,
  clientRecordStockMovement,
  clientGetStockMovements,
} from "@/lib/client-api";
import type { InventoryItem, StockMovement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  UNIT_TYPE_LABELS,
  isLiquidUnitType,
  presetsForUnitType,
  type UnitType,
} from "@/lib/units";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

interface Props {
  businessId: string;
}

type ItemFormState = {
  name: string;
  unit: string;
  unitType: UnitType;
  containerVolumeMl: string;
  parQuantity: string;
  costPerUnit: string;
  notes: string;
};

type MovementFormState = {
  movementType: "receive" | "adjust" | "waste";
  quantityDelta: string;
  notes: string;
  // For a bottle/keg receive: enter number of containers instead of raw ml.
  receiveAsContainers: boolean;
};

const EMPTY_ITEM_FORM: ItemFormState = {
  name: "",
  unit: "each",
  unitType: "each",
  containerVolumeMl: "",
  parQuantity: "",
  costPerUnit: "",
  notes: "",
};

const EMPTY_MOVEMENT_FORM: MovementFormState = {
  movementType: "receive",
  quantityDelta: "",
  notes: "",
  receiveAsContainers: true,
};

function movementTypeLabel(type: string) {
  if (type === "receive") return "Receive";
  if (type === "waste") return "Waste";
  return "Adjust";
}

function movementDeltaDisplay(movement: StockMovement) {
  const delta = movement.quantityDelta;
  const sign = delta > 0 ? "+" : "";
  const colorClass =
    movement.movementType === "receive"
      ? "text-green-600"
      : movement.movementType === "waste"
        ? "text-red-600"
        : delta >= 0
          ? "text-amber-600"
          : "text-amber-600";
  return (
    <span className={`font-mono text-sm font-medium ${colorClass}`}>
      {sign}{delta}
    </span>
  );
}

export function InventoryManagementClient({ businessId }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    void loadItems();
  }, [businessId]);

  async function loadItems() {
    setLoading(true);
    try {
      const data = await clientGetInventoryItems(businessId);
      setItems(data);
    } catch {
      toast.error("Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }

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
    if (isLiquid) {
      const parsed = Number(itemForm.containerVolumeMl);
      if (!itemForm.containerVolumeMl || isNaN(parsed) || parsed <= 0) {
        toast.error("Enter the container volume (ml) for a bottle/keg item");
        return;
      }
      containerVolumeMl = parsed;
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
          parQuantity:
            itemForm.parQuantity !== "" ? Number(itemForm.parQuantity) : undefined,
          costPerUnit:
            itemForm.costPerUnit !== "" ? Number(itemForm.costPerUnit) : undefined,
          notes: itemForm.notes.trim() || undefined,
        });
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        toast.success("Item updated");
      } else {
        const created = await clientCreateInventoryItem(businessId, {
          name: itemForm.name.trim(),
          unit: itemForm.unit.trim() || "each",
          unitType: itemForm.unitType,
          containerVolumeMl: containerVolumeMl ?? undefined,
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
      toast.success("Item deleted");
    } catch {
      toast.error("Failed to delete item");
    }
  }

  // ── Stock movements ──────────────────────────────────────────────────────────

  function openMovement(item: InventoryItem) {
    setMovementTargetId(item.id);
    setMovementForm(EMPTY_MOVEMENT_FORM);
    setMovementDialog(true);
  }

  async function saveMovement() {
    if (!movementTargetId) return;
    const target = items.find((i) => i.id === movementTargetId);
    const value = Number(movementForm.quantityDelta);
    if (!movementForm.quantityDelta || isNaN(value) || value === 0) {
      toast.error("Enter a non-zero quantity");
      return;
    }
    const liquidReceive =
      target != null &&
      isLiquidUnitType(target.unitType) &&
      movementForm.movementType === "receive" &&
      movementForm.receiveAsContainers;
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
          movementForm.movementType === "waste" ? -Math.abs(value) : value;
        await clientRecordStockMovement(businessId, movementTargetId, {
          movementType: movementForm.movementType,
          quantityDelta: effectiveDelta,
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
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track stock levels and record movements
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadItems}>
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
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium">{lowStockItems.length}</span>{" "}
            {lowStockItems.length === 1 ? "item is" : "items are"} below par level:{" "}
            {lowStockItems.map((i) => i.name).join(", ")}
          </span>
        </div>
      )}

      {/* Item list */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading inventory…</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
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
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              {/* Low-stock icon */}
              {item.isLowStock && (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              )}

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.parQuantity != null
                    ? `par: ${item.parQuantity} ${item.unit}`
                    : item.unit}
                  {item.costPerUnit != null && (
                    <span className="ml-2">· ${item.costPerUnit}/{item.unit}</span>
                  )}
                </p>
              </div>

              {/* Quantity badge */}
              <Badge
                variant="outline"
                className={
                  item.isLowStock
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-green-300 bg-green-50 text-green-700"
                }
              >
                {item.currentQuantity} {item.unit}
              </Badge>

              {/* Actions */}
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="Record movement"
                  onClick={() => openMovement(item)}
                >
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="View history"
                  onClick={() => openHistory(item)}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  title="Edit item"
                  onClick={() => openEditItem(item)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  title="Delete item"
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
                <Label htmlFor="inv-cost">Cost per unit ($)</Label>
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
            <Button variant="outline" onClick={() => setItemDialog(false)}>
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
                      <ArrowUpCircle className="h-3.5 w-3.5 text-green-600" />
                      Receive (stock in)
                    </span>
                  </SelectItem>
                  <SelectItem value="waste">
                    <span className="flex items-center gap-2">
                      <ArrowDownCircle className="h-3.5 w-3.5 text-red-600" />
                      Waste (stock out)
                    </span>
                  </SelectItem>
                  <SelectItem value="adjust">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-3.5 w-3.5 text-amber-600" />
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
              <Input
                id="mv-qty"
                type="number"
                step="0.001"
                value={movementForm.quantityDelta}
                onChange={(e) =>
                  setMovementForm((f) => ({ ...f, quantityDelta: e.target.value }))
                }
                placeholder="e.g. 5"
              />
              {receiveMlPreview != null && (
                <p className="text-xs text-muted-foreground">
                  = {receiveMlPreview.toLocaleString()} ml
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
            <Button variant="outline" onClick={() => setMovementDialog(false)}>
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
                  className="flex items-start gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {movementTypeLabel(m.movementType)}
                      </Badge>
                      {m.alertTriggered && (
                        <Badge
                          variant="outline"
                          className="text-xs border-amber-300 bg-amber-50 text-amber-700"
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Alert sent
                        </Badge>
                      )}
                    </div>
                    {m.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{m.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(m.createdAt).toLocaleString()}
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
        title="Delete Item"
        description={`"${itemToDelete?.name}" and all its movement history will be permanently deleted.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (itemToDelete) void confirmDeleteItem(itemToDelete);
          setItemToDelete(null);
        }}
      />
    </div>
  );
}
