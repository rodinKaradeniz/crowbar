"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, Truck } from "lucide-react";

import {
  clientCreatePurchaseOrder,
  clientGetInventoryItems,
  clientGetPackConversions,
  clientGetPurchaseOrders,
  clientGetSuppliers,
  clientReceivePurchaseOrder,
  clientUpdatePurchaseOrderStatus,
} from "@/lib/client-api";
import type { InventoryItem, PackConversion, PurchaseOrder, Supplier } from "@/types";
import { useRegionalSettings } from "@/contexts/regional-context";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

const STATUS_LABELS: Record<PurchaseOrder["status"], string> = {
  draft: "Draft",
  approved: "Approved",
  ordered: "Ordered",
  partially_received: "Part received",
  received: "Received",
  closed_short: "Closed short",
  cancelled: "Cancelled",
};

// All neutral. A purchase order still owed is next week's problem by
// definition — §08 puts ordering on the neutral tier explicitly, and it is one
// of the two cases it says NEVER qualifies as attend. Position and weight carry
// which stage an order is at; `closed_short` is a real outcome, not a failure.
const STATUS_CLASS: Record<PurchaseOrder["status"], string> = {
  draft: "text-muted-foreground",
  approved: "text-foreground",
  ordered: "text-foreground",
  partially_received: "text-foreground",
  received: "text-foreground",
  closed_short: "text-muted-foreground",
  cancelled: "text-muted-foreground",
};

type DraftLine = {
  inventoryItemId: string;
  packConversionId: string;
  description: string;
  orderedQuantity: string;
  unitPrice: string;
};

const EMPTY_LINE: DraftLine = {
  inventoryItemId: "",
  packConversionId: "",
  description: "",
  orderedQuantity: "1",
  unitPrice: "",
};

interface Props {
  businessId: string;
  canManage: boolean;
  /** Every status transition — approve, mark ordered, close short — commits
   *  the venue's money, so it is a separate capability from receiving. */
  canApprove: boolean;
}

export function PurchaseOrdersPanel({ businessId, canManage, canApprove }: Props) {
  const { currencyCode, locale } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([EMPTY_LINE]);
  const [packsByItem, setPacksByItem] = useState<Record<string, PackConversion[]>>({});
  const [saving, setSaving] = useState(false);

  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [receiptLines, setReceiptLines] = useState<
    Record<string, { quantity: string; price: string; discrepancy: string }>
  >({});
  const [receiptRefs, setReceiptRefs] = useState({ delivery: "", invoice: "" });
  const [receiptKey, setReceiptKey] = useState("");
  const [receiptSaving, setReceiptSaving] = useState(false);

  const [closingShort, setClosingShort] = useState<PurchaseOrder | null>(null);
  const [closureReason, setClosureReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderRows, supplierRows, itemRows] = await Promise.all([
        clientGetPurchaseOrders(businessId, statusFilter === "all" ? undefined : statusFilter),
        clientGetSuppliers(businessId),
        clientGetInventoryItems(businessId),
      ]);
      setOrders(orderRows);
      setSuppliers(supplierRows);
      setItems(itemRows);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load purchase orders");
    } finally {
      setLoading(false);
    }
  }, [businessId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const itemName = useMemo(
    () => Object.fromEntries(items.map((item) => [item.id, item.name])),
    [items],
  );
  const supplierName = useMemo(
    () => Object.fromEntries(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );

  async function loadPacks(itemId: string) {
    if (!itemId || packsByItem[itemId]) return;
    try {
      const packs = await clientGetPackConversions(businessId, itemId);
      setPacksByItem((prev) => ({ ...prev, [itemId]: packs }));
    } catch {
      toast.error("Could not load pack sizes for that item");
    }
  }

  function openCreate() {
    setSupplierId("");
    setReference("");
    setLines([EMPTY_LINE]);
    setCreateOpen(true);
  }

  async function createOrder() {
    if (!supplierId) {
      toast.error("Choose a supplier");
      return;
    }
    const prepared = lines.filter((line) => line.inventoryItemId && line.packConversionId);
    if (prepared.length === 0) {
      toast.error("Add at least one line with an item and a pack size");
      return;
    }
    for (const line of prepared) {
      if (!(Number(line.orderedQuantity) > 0)) {
        toast.error("Every line needs a quantity above zero");
        return;
      }
      if (line.unitPrice === "" || Number.isNaN(Number(line.unitPrice))) {
        toast.error("Every line needs a price per pack");
        return;
      }
    }
    setSaving(true);
    try {
      await clientCreatePurchaseOrder(businessId, {
        supplierId,
        reference: reference.trim() || undefined,
        lines: prepared.map((line) => ({
          inventoryItemId: line.inventoryItemId,
          packConversionId: line.packConversionId,
          description: line.description.trim() || itemName[line.inventoryItemId] || "Item",
          orderedQuantity: Number(line.orderedQuantity),
          unitPrice: Number(line.unitPrice),
        })),
      });
      toast.success("Purchase order created");
      setCreateOpen(false);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not create the order");
    } finally {
      setSaving(false);
    }
  }

  async function transition(order: PurchaseOrder, status: string, reason?: string) {
    try {
      const updated = await clientUpdatePurchaseOrderStatus(businessId, order.id, status, reason);
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      toast.success(`Order ${STATUS_LABELS[updated.status].toLowerCase()}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update the order");
    }
  }

  function openReceive(order: PurchaseOrder) {
    setReceiving(order);
    setReceiptRefs({ delivery: "", invoice: "" });
    // A fresh key per receiving session, so a double-tap on Record is a retry
    // of the same delivery rather than a second one.
    setReceiptKey(crypto.randomUUID());
    setReceiptLines(
      Object.fromEntries(
        order.lines.map((line) => [
          line.id,
          {
            quantity: String(Math.max(line.orderedQuantity - line.receivedQuantity, 0)),
            price: String(line.unitPrice),
            discrepancy: "",
          },
        ]),
      ),
    );
  }

  async function recordReceipt() {
    if (!receiving) return;
    const prepared = receiving.lines
      .map((line) => ({ line, entry: receiptLines[line.id] }))
      .filter(({ entry }) => entry && Number(entry.quantity) > 0);
    if (prepared.length === 0) {
      toast.error("Enter a received quantity on at least one line");
      return;
    }
    setReceiptSaving(true);
    try {
      const receipt = await clientReceivePurchaseOrder(businessId, receiving.id, {
        idempotencyKey: receiptKey,
        deliveryReference: receiptRefs.delivery.trim() || undefined,
        invoiceReference: receiptRefs.invoice.trim() || undefined,
        lines: prepared.map(({ line, entry }) => ({
          purchaseOrderLineId: line.id,
          receivedQuantity: Number(entry.quantity),
          unitPrice: Number(entry.price),
          discrepancyReason: entry.discrepancy.trim() || undefined,
        })),
      });
      toast.success(
        receipt.purchaseOrderStatus === "received"
          ? "Delivery recorded. Order complete."
          : "Delivery recorded. Order partly received.",
      );
      setReceiving(null);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not record the delivery");
    } finally {
      setReceiptSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-t2">Purchase orders</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quantities and prices are per pack. Receiving moves stock and updates cost.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Order
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-l-2 border-critical-fill bg-critical-tint px-4 py-3 text-[length:var(--ui-size)] text-critical-text">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading purchase orders…</div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No purchase orders"
          description={
            statusFilter === "all"
              ? "Raise an order to record what you have asked a supplier for."
              : "No orders with that status."
          }
          action={canManage && statusFilter === "all" ? { label: "New Order", onClick: openCreate } : undefined}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => {
            const total = order.lines.reduce(
              (sum, line) => sum + line.orderedQuantity * line.unitPrice,
              0,
            );
            return (
              <div key={order.id} className="rounded-lg border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {supplierName[order.supplierId] ?? "Unknown supplier"}
                      {order.reference && (
                        <span className="text-muted-foreground"> · {order.reference}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.lines.length} {order.lines.length === 1 ? "line" : "lines"} ·{" "}
                      <span className="font-mono tabular-nums">{money(total)}</span>
                      {order.closureReason && ` · ${order.closureReason}`}
                    </div>
                  </div>
                  <Badge tone="neutral" className={STATUS_CLASS[order.status]}>
                    {STATUS_LABELS[order.status]}
                  </Badge>
                  {canManage && (
                    <div className="flex gap-1 shrink-0">
                      {canApprove && order.status === "draft" && (
                        <Button size="filter" variant="secondary" onClick={() => transition(order, "approved")}>
                          Approve
                        </Button>
                      )}
                      {canApprove && order.status === "approved" && (
                        <Button size="filter" variant="secondary" onClick={() => transition(order, "ordered")}>
                          Mark Ordered
                        </Button>
                      )}
                      {(order.status === "ordered" || order.status === "partially_received") && (
                        <Button size="filter" onClick={() => openReceive(order)}>
                          <Truck className="h-3.5 w-3.5 mr-1.5" />
                          Receive
                        </Button>
                      )}
                      {canApprove && order.status === "partially_received" && (
                        <Button
                          size="filter"
                          variant="secondary"
                          onClick={() => {
                            setClosureReason("");
                            setClosingShort(order);
                          }}
                        >
                          Close Short
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create order */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="po-reference">Reference</Label>
                <Input
                  id="po-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Lines</Label>
              {lines.map((line, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Select
                      value={line.inventoryItemId}
                      onValueChange={(value) => {
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === index
                              ? { ...l, inventoryItemId: value, packConversionId: "" }
                              : l,
                          ),
                        );
                        void loadPacks(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Item" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <Select
                      value={line.packConversionId}
                      onValueChange={(value) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, packConversionId: value } : l)),
                        )
                      }
                      disabled={!line.inventoryItemId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pack" />
                      </SelectTrigger>
                      <SelectContent>
                        {(packsByItem[line.inventoryItemId] ?? []).map((pack) => (
                          <SelectItem key={pack.id} value={pack.id}>
                            {pack.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      value={line.orderedQuantity}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) =>
                            i === index ? { ...l, orderedQuantity: e.target.value } : l,
                          ),
                        )
                      }
                      placeholder="Packs"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      value={line.unitPrice}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((l, i) => (i === index ? { ...l, unitPrice: e.target.value } : l)),
                        )
                      }
                      placeholder={`Per pack (${currencyCode})`}
                      inputMode="decimal"
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="secondary"
                size="filter"
                className="self-start"
                onClick={() => setLines((prev) => [...prev, EMPTY_LINE])}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Line
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createOrder} disabled={saving}>
              {saving ? "Creating…" : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close short -- an order that ends incomplete has to say why */}
      <Dialog open={closingShort !== null} onOpenChange={(open) => !open && setClosingShort(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close this order short?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Stock already received stays on the ledger. The rest will no longer be
              expected.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="closure-reason">Reason</Label>
              <Textarea
                id="closure-reason"
                value={closureReason}
                onChange={(e) => setClosureReason(e.target.value)}
                placeholder="e.g. Supplier discontinued the line"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setClosingShort(null)}>
              Cancel
            </Button>
            <Button
              disabled={!closureReason.trim()}
              onClick={async () => {
                if (!closingShort) return;
                await transition(closingShort, "closed_short", closureReason.trim());
                setClosingShort(null);
              }}
            >
              Close Short
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive delivery */}
      <Dialog open={receiving !== null} onOpenChange={(open) => !open && setReceiving(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record Delivery</DialogTitle>
          </DialogHeader>
          {receiving && (
            <div className="flex flex-col gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="delivery-ref">Delivery note</Label>
                  <Input
                    id="delivery-ref"
                    value={receiptRefs.delivery}
                    onChange={(e) =>
                      setReceiptRefs((r) => ({ ...r, delivery: e.target.value }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="invoice-ref">Invoice reference</Label>
                  <Input
                    id="invoice-ref"
                    value={receiptRefs.invoice}
                    onChange={(e) =>
                      setReceiptRefs((r) => ({ ...r, invoice: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Recorded for reconciliation only. Crowbar does not pay invoices.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="w-24">Received</TableHead>
                      <TableHead className="w-28">Price/pack</TableHead>
                      <TableHead>Discrepancy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receiving.lines.map((line) => {
                      const outstanding = line.orderedQuantity - line.receivedQuantity;
                      const entry = receiptLines[line.id];
                      const over = entry && Number(entry.quantity) > outstanding;
                      return (
                        <TableRow key={line.id}>
                          <TableCell className="max-w-[180px] truncate">
                            {itemName[line.inventoryItemId] ?? line.description}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{outstanding}</TableCell>
                          <TableCell>
                            <Input
                              value={entry?.quantity ?? ""}
                              inputMode="decimal"
                              onChange={(e) =>
                                setReceiptLines((prev) => ({
                                  ...prev,
                                  [line.id]: { ...prev[line.id], quantity: e.target.value },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={entry?.price ?? ""}
                              inputMode="decimal"
                              onChange={(e) =>
                                setReceiptLines((prev) => ({
                                  ...prev,
                                  [line.id]: { ...prev[line.id], price: e.target.value },
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={entry?.discrepancy ?? ""}
                              placeholder={over ? "Required — over-receipt" : "Optional"}
                              onChange={(e) =>
                                setReceiptLines((prev) => ({
                                  ...prev,
                                  [line.id]: { ...prev[line.id], discrepancy: e.target.value },
                                }))
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReceiving(null)}>
              Cancel
            </Button>
            <Button onClick={recordReceipt} disabled={receiptSaving}>
              {receiptSaving ? "Recording…" : "Record Delivery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
