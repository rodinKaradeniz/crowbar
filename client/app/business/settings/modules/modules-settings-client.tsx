"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { clientUpdateEnabledModules } from "@/lib/client-api";
import { MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Calendar, ClipboardList, ListOrdered, Package, BrainCircuit } from "lucide-react";

interface Props {
  businessId: string;
}

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
    description: "Online booking, schedule management, and reservation analytics.",
    icon: Calendar,
    required: true,
  },
  {
    key: MODULE_KEYS.QUEUE,
    label: "Queue",
    description: "Digital walk-in queue with live board and SMS notifications.",
    icon: ListOrdered,
  },
  {
    key: MODULE_KEYS.ORDERING,
    label: "Ordering",
    description: "QR menu, customer self-order, and kitchen/bar ticket board.",
    icon: ClipboardList,
  },
  {
    key: MODULE_KEYS.INVENTORY,
    label: "Inventory",
    description: "Stock tracking, par levels, movement history, and low-stock alerts.",
    icon: Package,
  },
  {
    key: MODULE_KEYS.INSIGHTS,
    label: "Insights",
    description: "ML-powered demand forecasts, cancellation risk, and operational KPIs.",
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
        `${MODULE_META.find((m) => m.key === key)?.label} ${currentlyEnabled ? "disabled" : "enabled"}.`,
      );
      router.refresh();
    } catch {
      toast.error("Failed to update modules. Please try again.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-8 px-[clamp(16px,2.5vw,32px)] py-6 max-w-2xl">
      <div>
        <h1 className="type-t1">Modules</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enable or disable platform modules for your business.
        </p>
      </div>

      <FieldGroup>
        <FieldSet>
          <FieldLegend>Available Modules</FieldLegend>
          <FieldDescription>
            Disabled modules are hidden from the sidebar and their API endpoints
            return 403. You can re-enable them at any time.
          </FieldDescription>

          <div className="space-y-3 mt-2">
            {MODULE_META.map(({ key, label, description, icon: Icon, required }) => {
              const enabled = enabledModules.includes(key);
              const isSaving = saving === key;

              return (
                <div key={key} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-medium text-sm">{label}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {description}
                        </p>
                        {required && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">
                            Always enabled
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      disabled={isSaving || required}
                      onClick={() => void handleToggle(key, enabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                        enabled ? "bg-primary" : "bg-input"
                      }`}
                    >
                      <span
                        className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                          enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </FieldSet>
      </FieldGroup>
    </div>
  );
}
