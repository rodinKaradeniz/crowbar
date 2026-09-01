"use client";

import { useEffect, useState } from "react";
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
  clientGetRegionalOptions,
  clientGetRegionalSuggestion,
} from "@/lib/client-api";
import { Building2, Clock, Layers, Puzzle, ChevronRight, ChevronLeft } from "lucide-react";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { DAYS_OF_WEEK } from "@/lib/days";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RegionalOption } from "@/types";
import { SERIES_HEX } from "@/lib/series-palette";

// Day ordering comes from the single source of truth (lib/days.ts).
const DAYS = DAYS_OF_WEEK.map((d) => d.key);
const DAY_LABELS: Record<string, string> = Object.fromEntries(
  DAYS_OF_WEEK.map((d) => [d.key, d.label]),
);

interface AvailableModule {
  id: string;
  label: string;
  description: string;
}

const AVAILABLE_MODULES: AvailableModule[] = [
  { id: "reservations", label: "Reservations", description: "Take and manage bookings" },
  { id: "insights", label: "Insights", description: "Demand forecasts from your own booking record" },
  { id: "queue", label: "Queue", description: "Walk-in queue with a live board at the door" },
  { id: "ordering", label: "Ordering", description: "QR table ordering and the kitchen and bar ticket board" },
  { id: "inventory", label: "Inventory", description: "Stock levels, movements, purchasing and cost" },
];

const STEPS = [
  { label: "Venue", icon: Building2 },
  { label: "Hours", icon: Clock },
  { label: "First service", icon: Layers },
  { label: "Modules", icon: Puzzle },
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
  initialCountryCode: string;
  initialCurrencyCode: string;
  initialLocale: string;
  initialTimezone: string;
  initialTaxLabel: string;
}

export default function OnboardingWizard({
  businessId,
  initialName,
  initialDescription,
  initialAddress,
  initialImage,
  initialCountryCode,
  initialCurrencyCode,
  initialLocale,
  initialTimezone,
  initialTaxLabel,
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
    if (initialTimezone && initialTimezone !== "UTC") return initialTimezone;
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [currencyCode, setCurrencyCode] = useState(initialCurrencyCode);
  const [locale, setLocale] = useState(initialLocale);
  const [taxLabel, setTaxLabel] = useState(initialTaxLabel);
  const [countries, setCountries] = useState<RegionalOption[]>([]);
  const [currencies, setCurrencies] = useState<RegionalOption[]>([]);

  useEffect(() => {
    void clientGetRegionalOptions("en").then((options) => {
      setCountries(options.countries);
      setCurrencies(options.currencies);
    }).catch(() => {});
  }, []);

  async function applyCountrySuggestion(code: string) {
    setCountryCode(code);
    try {
      const suggestion = await clientGetRegionalSuggestion(code);
      setCurrencyCode(suggestion.currencyCode);
      setLocale(suggestion.locale);
      setTaxLabel(suggestion.taxLabel);
    } catch {
      // Country remains editable even if optional suggestion data is unavailable.
    }
  }

  // Step 2: Hours
  const [hours, setHours] = useState<Record<string, DayHours>>(defaultHours);

  // Step 3: Service type
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState("60");
  const [serviceCapacity, setServiceCapacity] = useState("10");
  const [reservationResourceMode, setReservationResourceMode] = useState<"covers" | "legacy">("covers");
  const [reservableCovers, setReservableCovers] = useState("30");
  const [skipService, setSkipService] = useState(false);

  // Step 4: Modules
  const [selectedModules, setSelectedModules] = useState<string[]>(["reservations"]);

  async function handleNext() {
    setSaving(true);
    try {
      if (step === 0) {
        if (!name.trim()) { toast.error("Business name is required"); return; }
        if (!timezone) { toast.error("Timezone is required"); return; }
        await clientUpdateBusiness(businessId, {
          name, description, address, image, timezone,
          countryCode, currencyCode, locale, taxLabel,
        });
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
            availabilityResourceMode: reservationResourceMode,
            reservableCoverCapacity: reservationResourceMode === "covers" ? parseInt(reservableCovers) || 30 : undefined,
            color: SERIES_HEX[1],
          });
        }
        setStep(3);
      } else if (step === 3) {
        await clientUpdateEnabledModules(businessId, selectedModules);
        await clientCompleteOnboarding(businessId);
        toast.success("Venue set up. Opening your Overview.");
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
          <h1 className="type-t1">Set up your venue</h1>
          <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">Four steps. You can change any of it later in Settings.</p>
        </div>

        {/* A ruled step ledger. The numbered circles this replaces were a
            second status object competing with the badge — filled discs with a
            ring-offset halo, which is the one status shape §06 reserves. Here
            position and a 2px rule carry the same information. */}
        <ol className="mb-[var(--space-32)] grid grid-cols-4 gap-[var(--space-8)]">
          {STEPS.map((entry, i) => {
            const state = i < step ? "done" : i === step ? "current" : "ahead";
            return (
              <li key={entry.label} className="flex flex-col gap-[var(--space-8)]">
                <span
                  aria-hidden
                  className={`h-[2px] w-full ${
                    state === "ahead" ? "bg-border" : "bg-primary"
                  }`}
                />
                <span
                  className={`type-label ${
                    state === "current"
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {entry.label}
                </span>
                {state === "current" && (
                  <span className="sr-only">Current step</span>
                )}
              </li>
            );
          })}
        </ol>

        <p className="type-label mb-[var(--space-16)] text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>

        {/* Card */}
        <div className="space-y-5 border-t border-border pt-[var(--space-24)]">
          {/* Step 1: Profile */}
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="biz-name">Business name *</Label>
                <Input
                  id="biz-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="The name guests see"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-desc">Description</Label>
                <Textarea
                  id="biz-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What the venue is, in a sentence guests will read."
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Country *</Label>
                  <Select value={countryCode} onValueChange={(value) => void applyCountrySuggestion(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{countries.map((option) => <SelectItem key={option.code} value={option.code}>{option.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Currency *</Label>
                  <Select value={currencyCode} onValueChange={setCurrencyCode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{currencies.map((option) => <SelectItem key={option.code} value={option.code}>{option.code} — {option.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="biz-locale">Formatting locale *</Label><Input id="biz-locale" value={locale} onChange={(event) => setLocale(event.target.value)} placeholder="de-DE" /></div>
                <div className="space-y-1.5"><Label htmlFor="biz-tax-label">Tax label *</Label><Input id="biz-tax-label" value={taxLabel} onChange={(event) => setTaxLabel(event.target.value)} placeholder="VAT, GST, MwSt., Tax" /></div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-tz">Timezone *</Label>
                <TimezoneCombobox id="biz-tz" value={timezone} onChange={setTimezone} />
                <p className="text-[length:var(--ui-size)] text-muted-foreground">
                  Used to interpret your operating hours and happy-hour windows.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-img">Logo or cover image URL</Label>
                <Input
                  id="biz-img"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="https://..."
                />
                <p className="text-[length:var(--ui-size)] text-muted-foreground">Optional. Paste a public image URL.</p>
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
                      <Label htmlFor={`closed-${day}`} className="text-muted-foreground">Closed</Label>
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
                      placeholder="Dinner, Bar seating, Private hire"
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
                      <Label htmlFor="svc-capacity">Maximum party size</Label>
                      <Input
                        id="svc-capacity"
                        type="number"
                        min={1}
                        value={serviceCapacity}
                        onChange={(e) => setServiceCapacity(e.target.value)}
                      />
                    </div>
                  </div>
                  {/* Two mutually exclusive choices, on the Select primitive.
                      Raw <input type="radio"> was the one control on this
                      screen that carried no system styling at all — a browser
                      default in the middle of a designed form, and below the
                      48px tablet floor. */}
                  <div className="space-y-2 border-t border-border pt-[var(--space-16)]">
                    <Label htmlFor="svc-resource-mode">
                      How should guests reserve this service?
                    </Label>
                    <Select
                      value={reservationResourceMode}
                      onValueChange={(value) =>
                        setReservationResourceMode(value as "covers" | "legacy")
                      }
                    >
                      <SelectTrigger id="svc-resource-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="covers">Shared cover capacity</SelectItem>
                        <SelectItem value="legacy">I&apos;ll configure tables later</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[length:var(--ui-size)] text-muted-foreground">
                      {reservationResourceMode === "covers"
                        ? "For standing bars and venues without table-specific reservations."
                        : "Keeps this type in compatibility mode until Floor setup is complete."}
                    </p>
                    {reservationResourceMode === "covers" && (
                      <div className="pt-1">
                        <Label htmlFor="svc-covers">Reservable covers</Label>
                        <Input id="svc-covers" type="number" min={1} value={reservableCovers} onChange={(e) => setReservableCovers(e.target.value)} className="mt-1 max-w-40" />
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 4: Enable Modules */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-1">
                What this venue runs. A module that is off is removed from the
                navigation entirely. You can change this later in Settings.
              </p>
              {AVAILABLE_MODULES.map((mod) => (
                <div
                  key={mod.id}
                  className="flex items-start gap-[var(--space-12)] border-b border-border py-[var(--space-16)]"
                >
                  <Checkbox
                    id={`mod-${mod.id}`}
                    checked={selectedModules.includes(mod.id)}
                    onCheckedChange={() => toggleModule(mod.id)}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor={`mod-${mod.id}`} className="type-t2 normal-case">
                      {mod.label}
                    </Label>
                    <p className="mt-0.5 text-[length:var(--ui-size)] text-muted-foreground">
                      {mod.description}
                    </p>
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
            {saving ? "Saving…" : step === STEPS.length - 1 ? "Finish setup" : (
              <span className="flex items-center gap-1">Continue <ChevronRight className="w-4 h-4" /></span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
