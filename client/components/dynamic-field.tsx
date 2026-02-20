"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormFieldDefinition } from "@/types";

interface DynamicFieldProps {
  field: FormFieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function DynamicField({ field, value, onChange }: DynamicFieldProps) {
  const [timePicker, setTimePicker] = useState<string>(
    (value as string) || "12:00"
  );

  switch (field.type) {
    case "text":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required && " *"}
          </FieldLabel>
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            required={field.required}
          />
        </Field>
      );

    case "textarea":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required && " *"}
          </FieldLabel>
          <Textarea
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            required={field.required}
            rows={3}
          />
        </Field>
      );

    case "number":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required && " *"}
          </FieldLabel>
          <Input
            type="number"
            value={value !== undefined && value !== null ? String(value) : ""}
            onChange={(e) =>
              onChange(e.target.value ? parseFloat(e.target.value) : undefined)
            }
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            required={field.required}
          />
        </Field>
      );

    case "email":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required && " *"}
          </FieldLabel>
          <Input
            type="email"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "email@example.com"}
            required={field.required}
          />
        </Field>
      );

    case "phone":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required && " *"}
          </FieldLabel>
          <Input
            type="tel"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || "+1 (555) 123-4567"}
            required={field.required}
          />
        </Field>
      );

    case "date":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required && " *"}
          </FieldLabel>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                type="button"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !value && "text-muted-foreground"
                )}
              >
                {value
                  ? format(new Date(value as string), "PPP")
                  : field.placeholder || "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value ? new Date(value as string) : undefined}
                onSelect={(date) =>
                  onChange(date ? date.toISOString() : undefined)
                }
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </Field>
      );

    case "time":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required && " *"}
          </FieldLabel>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                type="button"
                className="w-full justify-start text-left font-normal"
              >
                <Clock className="mr-2 h-4 w-4" />
                {(value as string) || timePicker || "Pick a time"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-3">
                <input
                  type="time"
                  value={(value as string) || timePicker}
                  onChange={(e) => {
                    setTimePicker(e.target.value);
                    onChange(e.target.value);
                  }}
                  step="900"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </div>
            </PopoverContent>
          </Popover>
        </Field>
      );

    case "select":
      return (
        <Field>
          <FieldLabel>
            {field.label}
            {field.required && " *"}
          </FieldLabel>
          <Select
            value={(value as string) || ""}
            onValueChange={(v) => onChange(v)}
            required={field.required}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`}
              />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );

    case "checkbox":
      return (
        <Field>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`field-${field.id}`}
              checked={(value as boolean) || false}
              onCheckedChange={(checked) => onChange(checked === true)}
            />
            <label htmlFor={`field-${field.id}`} className="text-sm">
              {field.label}
              {field.required && " *"}
            </label>
          </div>
        </Field>
      );

    default:
      return (
        <Field>
          <FieldLabel>{field.label}</FieldLabel>
          <Input
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        </Field>
      );
  }
}
