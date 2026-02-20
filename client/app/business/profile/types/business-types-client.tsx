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
import { FormFieldBuilder } from "@/components/form-field-builder";
import { ServiceType, FormFieldDefinition } from "@/types";
import { Plus, Pencil, Trash2, Tag, FileText } from "lucide-react";
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
}

export default function BusinessTypesClient({
  businessId,
  initialServiceTypes,
}: BusinessTypesClientProps) {
  const router = useRouter();
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>(
    initialServiceTypes
  );
  const [editingType, setEditingType] = useState<ServiceType | null>(null);
  const [deletingType, setDeletingType] = useState<ServiceType | null>(
    null
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [formFields, setFormFields] = useState<FormFieldDefinition[]>([]);
  const [dialogTab, setDialogTab] = useState<"details" | "form">("details");

  const resetForm = () => {
    setName("");
    setDescription("");
    setCapacity("");
    setRequiresPayment(false);
    setAmount("");
    setDuration("");
    setColor("#3b82f6");
    setFormFields([]);
    setDialogTab("details");
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
    setRequiresPayment(type.requiresPayment);
    setAmount(type.amount?.toString() || "");
    setDuration(type.duration?.toString() || "");
    setColor(type.color);
    setFormFields(type.formFields || []);
    setDialogTab("details");
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
        toast.success("Service type deleted");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete service type");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formFieldsToSave = formFields.length > 0 ? formFields : undefined;

      if (editingType) {
        const updated = await clientUpdateServiceType(editingType.id, {
          name,
          description: description || undefined,
          capacity: parseInt(capacity, 10),
          requiresPayment,
          amount: requiresPayment && amount ? parseFloat(amount) : undefined,
          duration: duration ? parseInt(duration, 10) : undefined,
          color,
          formFields: formFieldsToSave,
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
          requiresPayment,
          amount: requiresPayment && amount ? parseFloat(amount) : undefined,
          duration: duration ? parseInt(duration, 10) : undefined,
          color,
          formFields: formFieldsToSave,
        });
        setServiceTypes([...serviceTypes, created]);
      }

      toast.success(editingType ? "Service type updated" : "Service type created");
      setIsDialogOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save service type");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Service Types</h1>
          <p className="page-description">
            Manage different types of services you offer
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Service Type
        </Button>
      </div>

      {serviceTypes.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            No service types configured yet
          </p>
          <Button onClick={handleCreate} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Service Type
          </Button>
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
                <div>Capacity: {type.capacity}</div>
                {type.requiresPayment && type.amount && (
                  <div>Price: ${type.amount.toFixed(2)}</div>
                )}
                {type.duration && <div>Duration: {type.duration} min</div>}
                {!type.requiresPayment && (
                  <div className="text-green-600 dark:text-green-400">Free</div>
                )}
                {type.formFields && type.formFields.length > 0 && (
                  <div className="flex items-center gap-1 text-primary">
                    <FileText className="h-3 w-3" />
                    Custom form ({type.formFields.length} fields)
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Edit Service Type" : "Create Service Type"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Update the service type details and form configuration"
                : "Add a new service type for your business"}
            </DialogDescription>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex border-b mb-4">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                dialogTab === "details"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setDialogTab("details")}
            >
              Details
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                dialogTab === "form"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setDialogTab("form")}
            >
              Form Fields
              {formFields.length > 0 && (
                <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                  {formFields.length}
                </span>
              )}
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Details tab */}
            {dialogTab === "details" && (
              <FieldGroup>
                <Field>
                  <FieldLabel>Name *</FieldLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Standard Table, VIP Lounge, Consultation"
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
                    Maximum number of people for this service
                  </FieldDescription>
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
                  <FieldLabel>Duration (minutes, Optional)</FieldLabel>
                  <Input
                    type="number"
                    min="1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="e.g., 60"
                  />
                  <FieldDescription>
                    Expected duration for this service in minutes
                  </FieldDescription>
                </Field>
              </FieldGroup>
            )}

            {/* Form Fields tab */}
            {dialogTab === "form" && (
              <FormFieldBuilder
                fields={formFields}
                onChange={setFormFields}
              />
            )}

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
        title="Delete Service Type"
        description={`Are you sure you want to delete "${deletingType?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        variant="destructive"
      />
    </div>
  );
}
