"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  clientUpdateBusiness,
  clientCreateServiceType,
  clientCompleteOnboarding,
  clientUpdateEnabledModules,
} from "@/lib/client-api";
import { Building2, Clock, Layers, Puzzle, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { DAYS_OF_WEEK } from "@/lib/days";

// Day ordering comes from the single source of truth (lib/days.ts).
const DAYS = DAYS_OF_WEEK.map((d) => d.key);
const DAY_LABELS: Record<string, string> = Object.fromEntries(
  DAYS_OF_WEEK.map((d) => [d.key, d.label]),
);

interface AvailableModule {
  id: string;
  label: string;
  description: string;
  disabled?: boolean;
}

const AVAILABLE_MODULES: AvailableModule[] = [
  { id: "reservations", label: "Reservations", description: "Accept and manage bookings from customers" },
  { id: "insights", label: "Insights", description: "Analytics and demand forecasting for your business" },
  { id: "queue", label: "Queue", description: "Virtual walk-in queue management for your venue" },
  { id: "ordering", label: "Ordering", description: "QR-based table ordering with real-time kitchen ticket board" },
  { id: "inventory", label: "Inventory", description: "Track stock levels, record movements, and get low-stock alerts" },
];

const STEPS = [
  { label: "Business Profile", icon: Building2 },
  { label: "Operating Hours", icon: Clock },
  { label: "First Service", icon: Layers },
  { label: "Enable Modules", icon: Puzzle },
];

type DayHours = { closed: boolean; open: string; close: string };

function defaultHours(): Record<string, DayHours> {
  return Object.fromEntries(
    DAYS.map((d) => [d, { closed: false, open: "09:00", close: "17:00" }])
  );
}

interface OnboardingWizardProps {
  businessId: string;
  initialName: string;
  initialDescription: string;
  initialAddress: string;
  initialImage: string;
}

export default function OnboardingWizard({
  businessId,
  initialName,
  initialDescription,
  initialAddress,
  initialImage,
}: OnboardingWizardProps) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Profile
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [address, setAddress] = useState(initialAddress);
  const [image, setImage] = useState(initialImage);
  // Prefill the timezone from the browser; the owner confirms/changes it.
  const [timezone, setTimezone] = useState<string>(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });

  // Step 2: Hours
  const [hours, setHours] = useState<Record<string, DayHours>>(defaultHours);

  // Step 3: Service type
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState("60");
  const [serviceCapacity, setServiceCapacity] = useState("10");
  const [skipService, setSkipService] = useState(false);

  // Step 4: Modules
  const [selectedModules, setSelectedModules] = useState<string[]>(["reservations"]);

  async function handleNext() {
    setSaving(true);
    try {
      if (step === 0) {
        if (!name.trim()) { toast.error("Business name is required"); return; }
        if (!timezone) { toast.error("Timezone is required"); return; }
        await clientUpdateBusiness(businessId, { name, description, address, image, timezone });
        setStep(1);
      } else if (step === 1) {
        const operatingHours = Object.fromEntries(
          DAYS.map((d) => {
            const h = hours[d];
            return [d, h.closed ? { closed: true } : { open: h.open, close: h.close }];
          })
        );
        await clientUpdateBusiness(businessId, { operatingHours });
        setStep(2);
      } else if (step === 2) {
        if (!skipService) {
          if (!serviceName.trim()) { toast.error("Service name is required"); return; }
          await clientCreateServiceType({
            businessId,
            name: serviceName,
            capacity: parseInt(serviceCapacity) || 10,
            duration: parseInt(serviceDuration) || 60,
            color: "#6366f1",
          });
        }
        setStep(3);
      } else if (step === 3) {
        await clientUpdateEnabledModules(businessId, selectedModules);
        await clientCompleteOnboarding(businessId);
        toast.success("Setup complete! Welcome to your dashboard.");
        router.push("/business/overview");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  function toggleModule(id: string) {
    setSelectedModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  }

  function setDayField(day: string, field: keyof DayHours, value: string | boolean) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="page-title">Set up your business</h1>
          <p className="text-sm text-muted-foreground mt-1">Complete these steps to get started with Crowbar</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors ${
                  i < step
                    ? "bg-primary text-primary-foreground"
                    : i === step
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-10 h-px ${i < step ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step label */}
        <p className="text-center text-sm font-medium text-muted-foreground mb-6">
          Step {step + 1} of {STEPS.length} — {STEPS[step].label}
        </p>

        {/* Card */}
        <div className="border rounded-xl p-8 bg-card shadow-sm space-y-5">
          {/* Step 1: Profile */}
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="biz-name">Business name *</Label>
                <Input
                  id="biz-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rodin's Barbershop"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-desc">Description</Label>
                <Textarea
                  id="biz-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell customers what your business is about..."
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-addr">Address</Label>
                <Input
                  id="biz-addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, City, Country"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-tz">Timezone *</Label>
                <TimezoneCombobox id="biz-tz" value={timezone} onChange={setTimezone} />
                <p className="text-xs text-muted-foreground">
                  Used to interpret your operating hours and happy-hour windows.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-img">Logo / cover image URL</Label>
                <Input
                  id="biz-img"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground">Optional. Paste a public image URL.</p>
              </div>
            </>
          )}

          {/* Step 2: Operating Hours */}
          {step === 1 && (
            <div className="space-y-3">
              {DAYS.map((day) => {
                const h = hours[day];
                return (
                  <div key={day} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium">{DAY_LABELS[day]}</div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`closed-${day}`}
                        checked={h.closed}
                        onCheckedChange={(v) => setDayField(day, "closed", !!v)}
                      />
                      <Label htmlFor={`closed-${day}`} className="text-xs text-muted-foreground">Closed</Label>
                    </div>
                    {!h.closed && (
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Input
                          type="time"
                          value={h.open}
                          onChange={(e) => setDayField(day, "open", e.target.value)}
                          className="w-28 text-sm"
                        />
                        <span className="text-muted-foreground text-sm">–</span>
                        <Input
                          type="time"
                          value={h.close}
                          onChange={(e) => setDayField(day, "close", e.target.value)}
                          className="w-28 text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 3: First Service Type */}
          {step === 2 && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <Checkbox
                  id="skip-service"
                  checked={skipService}
                  onCheckedChange={(v) => setSkipService(!!v)}
                />
                <Label htmlFor="skip-service" className="text-sm text-muted-foreground">
                  Skip for now — I&apos;ll add services later
                </Label>
              </div>
              {!skipService && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="svc-name">Service name *</Label>
                    <Input
                      id="svc-name"
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                      placeholder="e.g. Haircut, Consultation, Table for 2..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="svc-duration">Duration (minutes)</Label>
                      <Input
                        id="svc-duration"
                        type="number"
                        min={5}
                        value={serviceDuration}
                        onChange={(e) => setServiceDuration(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="svc-capacity">Capacity (guests)</Label>
                      <Input
                        id="svc-capacity"
                        type="number"
                        min={1}
                        value={serviceCapacity}
                        onChange={(e) => setServiceCapacity(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 4: Enable Modules */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-1">
                Choose which modules to enable. You can change this anytime in settings.
              </p>
              {AVAILABLE_MODULES.map((mod) => (
                <div
                  key={mod.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    mod.disabled
                      ? "opacity-50 cursor-not-allowed bg-muted/30"
                      : selectedModules.includes(mod.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  <Checkbox
                    id={`mod-${mod.id}`}
                    checked={selectedModules.includes(mod.id)}
                    disabled={mod.disabled}
                    onCheckedChange={() => !mod.disabled && toggleModule(mod.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor={`mod-${mod.id}`} className={`font-medium text-sm ${mod.disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                      {mod.label}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={saving}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          ) : (
            <div />
          )}
          <Button onClick={handleNext} disabled={saving}>
            {saving ? "Saving..." : step === STEPS.length - 1 ? "Finish setup" : (
              <span className="flex items-center gap-1">Continue <ChevronRight className="w-4 h-4" /></span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
