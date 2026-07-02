"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Business } from "@/types";
import { clientUpdateBusiness } from "@/lib/client-api";
import { DAYS_OF_WEEK } from "@/lib/days";
import { toast } from "sonner";

interface BusinessHoursClientProps {
  businessId: string;
  initialBusiness: Business | undefined;
}

export default function BusinessHoursClient({
  businessId,
  initialBusiness,
}: BusinessHoursClientProps) {
  const router = useRouter();
  const [operatingHours, setOperatingHours] = useState<
    Record<
      string,
      { closed: true } | { open: string; close: string; closed?: false }
    >
  >(
    initialBusiness?.operatingHours || {
      monday: { open: "09:00", close: "22:00" },
      tuesday: { open: "09:00", close: "22:00" },
      wednesday: { open: "09:00", close: "22:00" },
      thursday: { open: "09:00", close: "22:00" },
      friday: { open: "09:00", close: "23:00" },
      saturday: { open: "09:00", close: "23:00" },
      sunday: { open: "10:00", close: "21:00" },
    }
  );

  const [isSaving, setIsSaving] = useState(false);

  const handleDayChange = (
    day: string,
    field: "open" | "close" | "closed",
    value: string | boolean
  ) => {
    setOperatingHours((prev) => {
      const currentDay = prev[day];

      if (field === "closed") {
        if (value === true) {
          return { ...prev, [day]: { closed: true } };
        } else {
          return {
            ...prev,
            [day]: { open: "09:00", close: "22:00", closed: false as const },
          };
        }
      }

      if (currentDay?.closed === true) {
        return {
          ...prev,
          [day]: {
            open: "09:00",
            close: "22:00",
            closed: false as const,
            [field]: value as string,
          },
        };
      }

      return {
        ...prev,
        [day]: {
          ...(currentDay as { open: string; close: string; closed?: false }),
          [field]: value,
        },
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await clientUpdateBusiness(businessId, {
        operatingHours: operatingHours as Record<string, unknown>,
      });
      toast.success("Operating hours saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save operating hours");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Operating Hours</h1>
        <p className="page-description">
          Set your business&apos;s opening and closing times
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <FieldSet>
            <FieldLegend>Weekly Schedule</FieldLegend>
            <FieldDescription>
              Configure hours for each day of the week
            </FieldDescription>

            {DAYS_OF_WEEK.map((day) => {
              const dayHours = operatingHours[day.key] || {
                open: "09:00",
                close: "22:00",
              };
              const isClosed = dayHours.closed === true;
              const openValue = isClosed ? "09:00" : dayHours.open;
              const closeValue = isClosed ? "22:00" : dayHours.close;

              return (
                <div key={day.key} className="flex items-center gap-4">
                  <div className="w-28 text-sm font-medium">{day.label}</div>
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      type="time"
                      value={openValue}
                      onChange={(e) =>
                        handleDayChange(day.key, "open", e.target.value)
                      }
                      disabled={isClosed}
                      className="w-32"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input
                      type="time"
                      value={closeValue}
                      onChange={(e) =>
                        handleDayChange(day.key, "close", e.target.value)
                      }
                      disabled={isClosed}
                      className="w-32"
                    />
                    <div className="flex items-center gap-2 ml-4">
                      <input
                        type="checkbox"
                        id={`closed-${day.key}`}
                        checked={isClosed}
                        onChange={(e) =>
                          handleDayChange(day.key, "closed", e.target.checked)
                        }
                        className="h-4 w-4 rounded border-input"
                      />
                      <label
                        htmlFor={`closed-${day.key}`}
                        className="text-sm text-muted-foreground cursor-pointer"
                      >
                        Closed
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </FieldSet>

          <Field>
            <div className="button-group-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </form>
    </div>
  );
}
