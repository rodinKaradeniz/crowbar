"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Lock,
} from "lucide-react";
import { FormFieldDefinition } from "@/types";

interface FormFieldBuilderProps {
  fields: FormFieldDefinition[];
  onChange: (fields: FormFieldDefinition[]) => void;
}

const FIELD_TYPES: { value: FormFieldDefinition["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Text Area" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "date", label: "Date Picker" },
  { value: "time", label: "Time Picker" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

const DEFAULT_SYSTEM_FIELDS: FormFieldDefinition[] = [
  { id: "sys_date", label: "Date", type: "date", required: true, order: 0, system: true },
  { id: "sys_time", label: "Time", type: "time", required: true, order: 1, system: true },
  { id: "sys_guests", label: "Number of Guests", type: "number", required: true, min: 1, order: 2, system: true },
  { id: "sys_name", label: "Full Name", type: "text", required: true, placeholder: "Jane Doe", order: 3, system: true },
  { id: "sys_email", label: "Email", type: "email", required: true, placeholder: "jane@example.com", order: 4, system: true },
  { id: "sys_phone", label: "Phone Number", type: "phone", required: true, placeholder: "+1 (555) 123-4567", order: 5, system: true },
];

function generateFieldId(): string {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function FormFieldBuilder({ fields, onChange }: FormFieldBuilderProps) {
  const [expandedField, setExpandedField] = useState<string | null>(null);

  const addField = () => {
    const maxOrder = fields.length > 0 ? Math.max(...fields.map((f) => f.order)) : -1;
    const newField: FormFieldDefinition = {
      id: generateFieldId(),
      label: "",
      type: "text",
      required: false,
      order: maxOrder + 1,
      system: false,
    };
    onChange([...fields, newField]);
    setExpandedField(newField.id);
  };

  const removeField = (id: string) => {
    onChange(fields.filter((f) => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<FormFieldDefinition>) => {
    onChange(
      fields.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const moveField = (id: string, direction: "up" | "down") => {
    const sorted = [...fields].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((f) => f.id === id);
    if (
      (direction === "up" && idx === 0) ||
      (direction === "down" && idx === sorted.length - 1)
    ) {
      return;
    }

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const tempOrder = sorted[idx].order;
    sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order };
    sorted[swapIdx] = { ...sorted[swapIdx], order: tempOrder };
    onChange(sorted);
  };

  const initializeDefaults = () => {
    onChange([...DEFAULT_SYSTEM_FIELDS]);
  };

  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Form Fields</h3>
          <p className="text-xs text-muted-foreground">
            Customize the reservation form for this service type
          </p>
        </div>
        {fields.length === 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={initializeDefaults}
          >
            Load Defaults
          </Button>
        )}
      </div>

      {sortedFields.length === 0 ? (
        <div className="text-center py-6 border rounded-lg border-dashed">
          <p className="text-sm text-muted-foreground mb-3">
            No custom form fields configured. The default reservation form will
            be used.
          </p>
          <div className="flex gap-2 justify-center">
            <Button type="button" variant="outline" size="sm" onClick={initializeDefaults}>
              Start with Defaults
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addField}>
              <Plus className="h-3 w-3 mr-1" />
              Add Blank Field
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedFields.map((field, index) => (
            <div
              key={field.id}
              className="border rounded-lg bg-card"
            >
              {/* Collapsed header */}
              <div
                className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent/50 rounded-lg transition-colors"
                onClick={() =>
                  setExpandedField(expandedField === field.id ? null : field.id)
                }
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

                {field.system && (
                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                )}

                <span className="text-sm font-medium flex-1 truncate">
                  {field.label || "(untitled field)"}
                </span>

                <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">
                  {FIELD_TYPES.find((t) => t.value === field.type)?.label || field.type}
                </span>

                {field.required && (
                  <span className="text-xs text-orange-600 dark:text-orange-400">
                    required
                  </span>
                )}

                <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => moveField(field.id, "up")}
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => moveField(field.id, "down")}
                    disabled={index === sortedFields.length - 1}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  {!field.system && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeField(field.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded editor */}
              {expandedField === field.id && (
                <div className="px-3 pb-3 pt-1 border-t space-y-3">
                  <FieldGroup>
                    <div className="grid grid-cols-2 gap-3">
                      <Field>
                        <FieldLabel className="text-xs">Label</FieldLabel>
                        <Input
                          value={field.label}
                          onChange={(e) =>
                            updateField(field.id, { label: e.target.value })
                          }
                          placeholder="Field label"
                          className="h-8 text-sm"
                        />
                      </Field>

                      <Field>
                        <FieldLabel className="text-xs">Type</FieldLabel>
                        <Select
                          value={field.type}
                          onValueChange={(value) =>
                            updateField(field.id, {
                              type: value as FormFieldDefinition["type"],
                              // Clear type-specific props when switching
                              options: value === "select" ? field.options || ["Option 1"] : undefined,
                              min: value === "number" ? field.min : undefined,
                              max: value === "number" ? field.max : undefined,
                            })
                          }
                          disabled={field.system}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((ft) => (
                              <SelectItem key={ft.value} value={ft.value}>
                                {ft.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel className="text-xs">Placeholder</FieldLabel>
                      <Input
                        value={field.placeholder || ""}
                        onChange={(e) =>
                          updateField(field.id, {
                            placeholder: e.target.value || undefined,
                          })
                        }
                        placeholder="Placeholder text"
                        className="h-8 text-sm"
                      />
                    </Field>

                    {/* Options editor for select type */}
                    {field.type === "select" && (
                      <Field>
                        <FieldLabel className="text-xs">Options</FieldLabel>
                        <FieldDescription className="text-xs">
                          One option per line
                        </FieldDescription>
                        <textarea
                          value={(field.options || []).join("\n")}
                          onChange={(e) =>
                            updateField(field.id, {
                              options: e.target.value
                                .split("\n")
                                .filter((o) => o.trim()),
                            })
                          }
                          rows={3}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder={"Option 1\nOption 2\nOption 3"}
                        />
                      </Field>
                    )}

                    {/* Min/max for number type */}
                    {field.type === "number" && (
                      <div className="grid grid-cols-2 gap-3">
                        <Field>
                          <FieldLabel className="text-xs">Min</FieldLabel>
                          <Input
                            type="number"
                            value={field.min ?? ""}
                            onChange={(e) =>
                              updateField(field.id, {
                                min: e.target.value
                                  ? parseFloat(e.target.value)
                                  : undefined,
                              })
                            }
                            className="h-8 text-sm"
                          />
                        </Field>
                        <Field>
                          <FieldLabel className="text-xs">Max</FieldLabel>
                          <Input
                            type="number"
                            value={field.max ?? ""}
                            onChange={(e) =>
                              updateField(field.id, {
                                max: e.target.value
                                  ? parseFloat(e.target.value)
                                  : undefined,
                              })
                            }
                            className="h-8 text-sm"
                          />
                        </Field>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`required-${field.id}`}
                        checked={field.required}
                        onCheckedChange={(checked) =>
                          updateField(field.id, { required: checked === true })
                        }
                        disabled={field.system && field.required}
                      />
                      <label
                        htmlFor={`required-${field.id}`}
                        className="text-xs"
                      >
                        Required field
                      </label>
                    </div>
                  </FieldGroup>
                </div>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addField}
            className="w-full"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Custom Field
          </Button>
        </div>
      )}
    </div>
  );
}
