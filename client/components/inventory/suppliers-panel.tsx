"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Archive } from "lucide-react";

import {
  clientArchiveSupplier,
  clientCreateSupplier,
  clientGetSuppliers,
  clientUpdateSupplier,
} from "@/lib/client-api";
import type { Supplier } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";

type SupplierFormState = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

const EMPTY_FORM: SupplierFormState = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

interface Props {
  businessId: string;
  canManage: boolean;
  onChanged?: () => void;
}

export function SuppliersPanel({ businessId, canManage, onChanged }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toArchive, setToArchive] = useState<Supplier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSuppliers(await clientGetSuppliers(businessId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load suppliers");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("A supplier needs a name");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contactName: form.contactName.trim() || undefined,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      address: form.address.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (editing) {
        const updated = await clientUpdateSupplier(businessId, editing.id, payload);
        setSuppliers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        toast.success("Supplier updated");
      } else {
        const created = await clientCreateSupplier(businessId, payload);
        setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success("Supplier added");
      }
      setDialogOpen(false);
      onChanged?.();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save the supplier");
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!toArchive) return;
    try {
      await clientArchiveSupplier(businessId, toArchive.id);
      setSuppliers((prev) => prev.filter((s) => s.id !== toArchive.id));
      toast.success(`${toArchive.name} archived`);
      onChanged?.();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not archive the supplier");
    } finally {
      setToArchive(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="type-t2">Suppliers</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Who you buy from. Crowbar records orders and deliveries; it does not pay invoices.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Supplier
          </Button>
        )}
      </div>

      {error && (
        <div className="border-l-2 border-critical-fill bg-critical-tint px-4 py-3 text-[length:var(--ui-size)] text-critical-text">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading suppliers…</div>
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No suppliers yet"
          description="Add a supplier to start raising purchase orders."
          action={canManage ? { label: "Add Supplier", onClick: openCreate } : undefined}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {suppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{supplier.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[supplier.contactName, supplier.email, supplier.phone]
                    .filter(Boolean)
                    .join(" · ") || "No contact details"}
                </div>
              </div>
              {!supplier.isActive && <Badge tone="neutral">Archived</Badge>}
              {canManage && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="filter"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Edit supplier"
                    onClick={() => openEdit(supplier)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="filter"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    title="Archive supplier"
                    onClick={() => setToArchive(supplier)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-name">Name</Label>
              <Input
                id="supplier-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="supplier-contact">Contact</Label>
                <Input
                  id="supplier-contact"
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="supplier-phone">Phone</Label>
                <Input
                  id="supplier-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-email">Email</Label>
              <Input
                id="supplier-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-notes">Notes</Label>
              <Textarea
                id="supplier-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Supplier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={toArchive !== null}
        onOpenChange={(open) => !open && setToArchive(null)}
        title="Archive this supplier?"
        description={
          toArchive
            ? `${toArchive.name} will be hidden from new orders. Existing purchase history is kept.`
            : ""
        }
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={archive}
      />
    </div>
  );
}
