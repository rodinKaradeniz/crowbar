"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calendar, ClipboardList, ListOrdered, Package, BrainCircuit } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { clientUpdateEnabledModules } from "@/lib/client-api";
import { MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PageBody, PageHeader } from "@/components/page-header";

interface Props {
  businessId: string;
}

/**
 * Modules — what this venue has bought.
 *
 * Ruled rows, not cards. Each module is a checkbox, not a sliding switch: §06
 * declares nine primitives and a toggle switch is not one of them, so the
 * previous hand-rolled `role="switch"` was a tenth control with its own
 * `rounded-full` track, its own `shadow-lg` (which the bridge maps to E1 — a
 * dialog's elevation, on a settings row) and `disabled:opacity-50`, the
 * disabled treatment the system explicitly forbids.
 *
 * Turning a module off REMOVES its nav entry rather than greying it, and its
 * API returns 403. That is stated here because it is the consequence the
 * operator is actually choosing.
 */
const MODULE_META: {
  key: ModuleKey;
  label: string;
  description: string;
  icon: React.ElementType;
  required?: boolean;
}[] = [
  {
    key: MODULE_KEYS.RESERVATIONS,
    label: "Reservations",
    description: "Online booking, schedule management, and reservation reporting.",
    icon: Calendar,
    required: true,
  },
  {
    key: MODULE_KEYS.QUEUE,
    label: "Queue",
    description: "Walk-in queue with a live board and guest notifications.",
    icon: ListOrdered,
  },
  {
    key: MODULE_KEYS.ORDERING,
    label: "Ordering",
    description: "QR menu, guest self-order, and the kitchen and bar ticket board.",
    icon: ClipboardList,
  },
  {
    key: MODULE_KEYS.INVENTORY,
    label: "Inventory",
    description: "Stock levels, par levels, movement history, and purchasing.",
    icon: Package,
  },
  {
    key: MODULE_KEYS.INSIGHTS,
    label: "Insights",
    description: "Demand forecasts and cancellation risk from your own booking record.",
    icon: BrainCircuit,
  },
];

export default function ModulesSettingsClient({ businessId }: Props) {
  const router = useRouter();
  const { meContext } = useAuth();
  const [saving, setSaving] = useState<ModuleKey | null>(null);

  const enabledModules: string[] =
    meContext?.enabledModules ?? Object.values(MODULE_KEYS);

  async function handleToggle(key: ModuleKey, currentlyEnabled: boolean) {
    setSaving(key);
    const updated = currentlyEnabled
      ? enabledModules.filter((m) => m !== key)
      : [...enabledModules, key];
    try {
      await clientUpdateEnabledModules(businessId, updated);
      toast.success(
        `${MODULE_META.find((m) => m.key === key)?.label} ${currentlyEnabled ? "turned off" : "turned on"}.`,
      );
      router.refresh();
    } catch {
      toast.error("Could not update modules. Try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Modules"
        description="What this venue has turned on. A module that is off is removed from the navigation and its endpoints stop answering — it is not hidden behind a greyed-out entry."
      />

      <PageBody>
        <div className="flex flex-col border-t border-border">
          {MODULE_META.map(({ key, label, description, icon: Icon, required }) => {
            const enabled = enabledModules.includes(key);
            const isSaving = saving === key;
            const inputId = `module-${key}`;

            return (
              <div
                key={key}
                className="flex items-start gap-[var(--space-12)] border-b border-border py-[var(--space-16)]"
              >
                <Checkbox
                  id={inputId}
                  checked={enabled}
                  disabled={isSaving || required}
                  onCheckedChange={() => void handleToggle(key, enabled)}
                  className="mt-0.5"
                />
                <Icon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div className="flex-1">
                  <Label htmlFor={inputId} className="type-t2 normal-case">
                    {label}
                  </Label>
                  <p className="mt-0.5 text-[length:var(--ui-size)] text-muted-foreground">
                    {description}
                  </p>
                  {required && (
                    <p className="type-label mt-[var(--space-8)] text-muted-foreground">
                      Always on
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
