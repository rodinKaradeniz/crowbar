"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ServiceType } from "@/types";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { ColorPicker } from "@/components/color-picker";
import {
  clientCreateServiceType,
  clientUpdateServiceType,
  clientDeleteServiceType,
} from "@/lib/client-api";
import { toast } from "sonner";

interface BusinessTypesClientProps {
  businessId: string;
  initialServiceTypes: ServiceType[];
  canEdit: boolean;
}

export default function BusinessTypesClient({
  businessId,
  initialServiceTypes,
  canEdit,
}: BusinessTypesClientProps) {
  const router = useRouter();
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>(
    initialServiceTypes
  );
  const [editingType, setEditingType] = useState<ServiceType | null>(null);
  const [deletingType, setDeletingType] = useState<ServiceType | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [maxConcurrentBookings, setMaxConcurrentBookings] = useState("1");
  const [isPendingEnabled, setIsPendingEnabled] = useState(true);
  const [duration, setDuration] = useState("");
  const [color, setColor] = useState("#3b82f6");

  const resetForm = () => {
    setName("");
    setDescription("");
    setCapacity("");
    setMaxConcurrentBookings("1");
    setIsPendingEnabled(true);
    setDuration("");
    setColor("#3b82f6");
    setEditingType(null);
  };

  const handleCreate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (type: ServiceType) => {
    setEditingType(type);
    setName(type.name);
    setDescription(type.description || "");
    setCapacity(type.capacity.toString());
    setMaxConcurrentBookings(type.maxConcurrentBookings.toString());
    setIsPendingEnabled(type.isPendingEnabled ?? true);
    setDuration(type.duration?.toString() || "");
    setColor(type.color);
    setIsDialogOpen(true);
  };

  const handleDelete = (type: ServiceType) => {
    setDeletingType(type);
  };

  const handleConfirmDelete = async () => {
    if (deletingType) {
      try {
        await clientDeleteServiceType(deletingType.id);
        setServiceTypes(serviceTypes.filter((t) => t.id !== deletingType.id));
        setDeletingType(null);
        toast.success("Booking type deleted");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete booking type");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (editingType) {
        const updated = await clientUpdateServiceType(editingType.id, {
          name,
          description: description || undefined,
          capacity: parseInt(capacity, 10),
          maxConcurrentBookings: parseInt(maxConcurrentBookings, 10),
          isPendingEnabled,
          duration: duration ? parseInt(duration, 10) : undefined,
          color,
        });
        setServiceTypes(
          serviceTypes.map((t) => (t.id === editingType.id ? updated : t))
        );
      } else {
        const created = await clientCreateServiceType({
          businessId,
          name,
          description: description || undefined,
          capacity: parseInt(capacity, 10),
          maxConcurrentBookings: parseInt(maxConcurrentBookings, 10),
          isPendingEnabled,
          duration: duration ? parseInt(duration, 10) : undefined,
          color,
        });
        setServiceTypes([...serviceTypes, created]);
      }

      toast.success(editingType ? "Booking type updated" : "Booking type created");
      setIsDialogOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save booking type");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Booking Types</h1>
          <p className="page-description">
            Configure the types of reservations your business accepts
          </p>
        </div>
        {canEdit && (
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Booking Type
          </Button>
        )}
      </div>

      {!canEdit && (
        <div className="mb-6 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          You have read-only access. An owner or manager can change booking types.
        </div>
      )}

      {serviceTypes.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            No booking types configured yet
          </p>
          {canEdit && (
            <Button onClick={handleCreate} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Booking Type
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {serviceTypes.map((type) => (
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
                {canEdit && <div className="flex gap-1">
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
                </div>}
              </div>

              {type.description && (
                <p className="text-sm text-muted-foreground mb-2">
                  {type.description}
                </p>
              )}

              <div className="space-y-1 text-xs text-muted-foreground">
                <div>Capacity: {type.capacity}</div>
                <div>Concurrent bookings: {type.maxConcurrentBookings}</div>
                {type.duration && <div>Duration: {type.duration} min</div>}
                {type.isPendingEnabled && (
                  <div>Requires confirmation</div>
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
              {editingType ? "Edit Booking Type" : "Create Booking Type"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Update this booking type"
                : "Add a new type of reservation for your business"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel>Name *</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Standard Table, VIP Booth, Private Room"
                  required
                />
              </Field>

              <Field>
                <FieldLabel>Capacity *</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g., 4"
                  required
                />
                <FieldDescription>
                  Maximum number of guests for this booking type
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Description</FieldLabel>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this booking type"
                  rows={2}
                />
              </Field>

              <Field>
                <FieldLabel>Concurrent bookings *</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  value={maxConcurrentBookings}
                  onChange={(e) => setMaxConcurrentBookings(e.target.value)}
                  placeholder="e.g., 1"
                  required
                />
                <FieldDescription>
                  Maximum overlapping reservations for this booking type
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Color *</FieldLabel>
                <ColorPicker value={color} onChange={setColor} />
              </Field>

              <Field>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isPendingEnabled"
                    checked={isPendingEnabled}
                    onChange={(e) => setIsPendingEnabled(e.target.checked)}
                    className="rounded border-input"
                  />
                  <FieldLabel htmlFor="isPendingEnabled" className="mb-0">
                    Require confirmation
                  </FieldLabel>
                </div>
                <FieldDescription>
                  When enabled, reservations start as pending until you confirm them
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Duration (minutes, optional)</FieldLabel>
                <Input
                  type="number"
                  min="1"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g., 90"
                />
                <FieldDescription>
                  Expected duration for this booking in minutes
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
        title="Delete Booking Type"
        description={`Are you sure you want to delete "${deletingType?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </div>
  );
}
