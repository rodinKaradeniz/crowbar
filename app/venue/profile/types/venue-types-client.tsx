"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { getReservationTypesByVenueId } from "@/mock-data";
import { ReservationType } from "@/types";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { ColorPicker } from "@/components/color-picker";

interface VenueTypesClientProps {
  venueId: string;
}

export default function VenueTypesClient({ venueId }: VenueTypesClientProps) {
  const [reservationTypes, setReservationTypes] = useState<ReservationType[]>(
    []
  );
  const [editingType, setEditingType] = useState<ReservationType | null>(null);
  const [deletingType, setDeletingType] = useState<ReservationType | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [amount, setAmount] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [maxGuests, setMaxGuests] = useState("");

  useEffect(() => {
    const types = getReservationTypesByVenueId(venueId);
    setReservationTypes(types);
  }, [venueId]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setRequiresPayment(false);
    setAmount("");
    setColor("#3b82f6");
    setMaxGuests("");
    setEditingType(null);
  };

  const handleCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (type: ReservationType) => {
    setEditingType(type);
    setName(type.name);
    setDescription(type.description || "");
    setRequiresPayment(type.requiresPayment);
    setAmount(type.amount?.toString() || "");
    setColor(type.color);
    setMaxGuests(type.maxGuests?.toString() || "");
    setIsDialogOpen(true);
  };

  const handleDelete = (type: ReservationType) => {
    setDeletingType(type);
  };

  const handleConfirmDelete = () => {
    if (deletingType) {
      const updated = reservationTypes.filter((t) => t.id !== deletingType.id);
      setReservationTypes(updated);
      setDeletingType(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const typeData: Omit<ReservationType, "id" | "createdAt" | "updatedAt"> =
        {
          venueId,
          name,
          description: description || undefined,
          requiresPayment,
          amount: requiresPayment && amount ? parseFloat(amount) : undefined,
          color,
          maxGuests: maxGuests ? parseInt(maxGuests, 10) : undefined,
        };

      if (editingType) {
        const updated = reservationTypes.map((t) =>
          t.id === editingType.id
            ? { ...t, ...typeData, updatedAt: new Date().toISOString() }
            : t
        );
        setReservationTypes(updated);
      } else {
        const newType: ReservationType = {
          ...typeData,
          id: `type-${venueId}-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setReservationTypes([...reservationTypes, newType]);
      }

      setIsDialogOpen(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Reservation Types</h1>
          <p className="page-description">
            Manage different types of reservations
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Type
        </Button>
      </div>

      {reservationTypes.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            No reservation types configured yet
          </p>
          <Button onClick={handleCreate} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Type
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reservationTypes.map((type) => (
            <div
              key={type.id}
              className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: type.color }}
                  />
                  <h3 className="font-medium">{type.name}</h3>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(type)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(type)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {type.description && (
                <p className="text-sm text-muted-foreground mb-2">
                  {type.description}
                </p>
              )}

              <div className="space-y-1 text-xs text-muted-foreground">
                {type.requiresPayment && type.amount && (
                  <div>Price: ${type.amount.toFixed(2)}</div>
                )}
                {type.maxGuests && <div>Max Guests: {type.maxGuests}</div>}
                {!type.requiresPayment && (
                  <div className="text-green-600 dark:text-green-400">Free</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Edit Reservation Type" : "Create Reservation Type"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Update the reservation type details"
                : "Add a new reservation type for your venue"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel>Name *</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Standard Table, VIP Lounge"
                  required
                />
              </Field>

              <Field>
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this reservation type"
                  rows={2}
                />
              </Field>

              <Field>
                <FieldLabel>Color *</FieldLabel>
                <ColorPicker value={color} onChange={setColor} />
              </Field>

              <Field>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="requiresPayment"
                    checked={requiresPayment}
                    onChange={(e) => {
                      setRequiresPayment(e.target.checked);
                      if (!e.target.checked) setAmount("");
                    }}
                    className="rounded border-input"
                  />
                  <FieldLabel htmlFor="requiresPayment" className="mb-0">
                    Requires Payment
                  </FieldLabel>
                </div>
              </Field>

              {requiresPayment && (
                <Field>
                  <FieldLabel>Amount ($)</FieldLabel>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required={requiresPayment}
                  />
                </Field>
              )}

              <Field>
                <FieldLabel>Maximum Guests (Optional)</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  value={maxGuests}
                  onChange={(e) => setMaxGuests(e.target.value)}
                  placeholder="Leave empty for no limit"
                />
                <FieldDescription>
                  Limit the number of guests for this type
                </FieldDescription>
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : editingType
                  ? "Update"
                  : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!deletingType}
        onOpenChange={(open) => !open && setDeletingType(null)}
        title="Delete Reservation Type"
        description={`Are you sure you want to delete "${deletingType?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </div>
  );
}
