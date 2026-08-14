"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, History, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  clientArchiveTaxProfile,
  clientCreateTaxProfile,
  clientCreateTaxProfileVersion,
  clientGetRegionalAudit,
  clientGetRegionalOptions,
  clientGetRegionalSuggestion,
  clientGetTaxProfiles,
  clientUpdateBusiness,
} from "@/lib/client-api";
import { formatBusinessDateTime } from "@/lib/business-time";
import { venueLocalDateTimeToIso } from "@/lib/availability";
import type { Business, RegionalAudit, RegionalOption, TaxProfile } from "@/types";

type ProfileDraft = {
  code: string;
  name: string;
  rate: string;
  priceIncludesTax: boolean;
  effectiveFrom: string;
  note: string;
};

const EMPTY_PROFILE: ProfileDraft = {
  code: "",
  name: "",
  rate: "",
  priceIncludesTax: true,
  effectiveFrom: "",
  note: "",
};

export function RegionTaxSettingsClient({ business }: { business: Business }) {
  const [countryCode, setCountryCode] = useState(business.countryCode ?? "DE");
  const [currencyCode, setCurrencyCode] = useState(business.currencyCode ?? "EUR");
  const [locale, setLocale] = useState(business.locale ?? "de-DE");
  const [timezone, setTimezone] = useState(business.timezone ?? "Europe/Berlin");
  const [taxLabel, setTaxLabel] = useState(business.taxLabel ?? "VAT");
  const [countries, setCountries] = useState<RegionalOption[]>([]);
  const [currencies, setCurrencies] = useState<RegionalOption[]>([]);
  const [profiles, setProfiles] = useState<TaxProfile[]>([]);
  const [audits, setAudits] = useState<RegionalAudit[]>([]);
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<TaxProfile | null>(null);
  const [archiveProfile, setArchiveProfile] = useState<TaxProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_PROFILE);

  const load = useCallback(async () => {
    const [options, nextProfiles, nextAudits] = await Promise.all([
      clientGetRegionalOptions("en"),
      clientGetTaxProfiles(),
      clientGetRegionalAudit(business.id),
    ]);
    setCountries(options.countries);
    setCurrencies(options.currencies);
    setProfiles(nextProfiles);
    setAudits(nextAudits);
  }, [business.id]);

  useEffect(() => {
    void load().catch((error) => toast.error(error instanceof Error ? error.message : "Could not load regional settings"));
  }, [load]);

  const countryName = useMemo(
    () => countries.find((option) => option.code === countryCode)?.name ?? countryCode,
    [countries, countryCode],
  );

  async function applySuggestion() {
    try {
      const suggestion = await clientGetRegionalSuggestion(countryCode);
      setCurrencyCode(suggestion.currencyCode);
      setLocale(suggestion.locale);
      setTaxLabel(suggestion.taxLabel);
      toast.success(`Applied editable suggestions for ${countryName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load suggestions");
    }
  }

  async function saveRegion(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await clientUpdateBusiness(business.id, { countryCode, currencyCode, locale, timezone, taxLabel });
      toast.success("Regional configuration saved");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save regional configuration");
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setEditingProfile(null);
    setDraft(EMPTY_PROFILE);
    setProfileOpen(true);
  }

  function openVersion(profile: TaxProfile) {
    const current = profile.currentVersion;
    setEditingProfile(profile);
    setDraft({
      code: profile.code,
      name: current?.name ?? "",
      rate: current ? String(current.rate) : "",
      priceIncludesTax: current?.priceIncludesTax ?? true,
      effectiveFrom: "",
      note: "",
    });
    setProfileOpen(true);
  }

  async function saveProfile() {
    const rate = Number(draft.rate);
    if (!draft.name.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error("Enter a name and a rate from 0 to 100");
      return;
    }
    let effectiveFrom: string | undefined;
    if (draft.effectiveFrom) {
      const [datePart, timePart] = draft.effectiveFrom.split("T");
      const [year, month, day] = datePart.split("-").map(Number);
      effectiveFrom = venueLocalDateTimeToIso(
        new Date(year, month - 1, day),
        timePart,
        timezone,
      ) ?? undefined;
      if (!effectiveFrom) {
        toast.error("Choose a valid local time in the venue timezone");
        return;
      }
    }
    setSaving(true);
    try {
      const shared = {
        name: draft.name.trim(),
        rate,
        priceIncludesTax: draft.priceIncludesTax,
        effectiveFrom,
        note: draft.note.trim() || undefined,
      };
      if (editingProfile) {
        await clientCreateTaxProfileVersion(editingProfile.id, shared);
      } else {
        await clientCreateTaxProfile({ ...shared, code: draft.code.trim().toUpperCase() });
      }
      setProfileOpen(false);
      toast.success(editingProfile ? "Tax profile version scheduled" : "Tax profile created");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save tax profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container max-w-5xl">
      <div className="page-header">
        <h1 className="page-title">Region & operational tax</h1>
        <p className="page-description">Country-neutral venue formatting and non-fiscal tax estimates. Your compliant register remains authoritative.</p>
      </div>

      <form className="rounded-xl border bg-card p-5 space-y-5" onSubmit={saveRegion}>
        <div>
          <h2 className="font-semibold">Regional configuration</h2>
          <p className="text-sm text-muted-foreground">Country suggestions never overwrite settings until you apply and save them.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Country</Label><Select value={countryCode} onValueChange={setCountryCode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{countries.map((option) => <SelectItem key={option.code} value={option.code}>{option.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Currency</Label><Select value={currencyCode} onValueChange={setCurrencyCode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{currencies.map((option) => <SelectItem key={option.code} value={option.code}>{option.name} ({option.code})</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Locked after priced or monetary records exist.</p></div>
          <div className="space-y-1.5"><Label htmlFor="format-locale">Formatting locale</Label><Input id="format-locale" value={locale} onChange={(event) => setLocale(event.target.value)} placeholder="de-DE" /></div>
          <div className="space-y-1.5"><Label htmlFor="tax-label">Tax label</Label><Input id="tax-label" value={taxLabel} onChange={(event) => setTaxLabel(event.target.value)} placeholder="VAT, GST, MwSt., Tax" /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Timezone</Label><TimezoneCombobox value={timezone} onChange={setTimezone} /></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={applySuggestion}><RefreshCw /> Apply country suggestions</Button><Button disabled={saving}>{saving ? "Saving…" : "Save regional settings"}</Button></div>
      </form>

      <section className="mt-6 rounded-xl border bg-card p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">Tax profiles</h2><p className="text-sm text-muted-foreground">Profile changes append a dated version. Placed order lines retain their original calculation forever.</p></div><Button onClick={openCreate}><Plus /> New profile</Button></div>
        <div className="mt-4 divide-y">
          {profiles.map((profile) => {
            const current = profile.currentVersion;
            return <article className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center" key={profile.id}><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="font-medium">{current?.name ?? profile.code}</p><span className="rounded bg-muted px-2 py-0.5 text-xs figures">{profile.code}</span>{!profile.isActive && <span className="text-xs text-muted-foreground">Archived</span>}</div><p className="mt-1 text-sm text-muted-foreground">{current ? `${current.rate}% · prices ${current.priceIncludesTax ? "include" : "exclude"} ${taxLabel}` : "No effective version"} · {profile.versions.length} version{profile.versions.length === 1 ? "" : "s"}</p></div>{profile.isActive && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => openVersion(profile)}>New version</Button><Button size="icon" variant="ghost" aria-label={`Archive ${profile.code}`} onClick={() => setArchiveProfile(profile)}><Archive /></Button></div>}</article>;
          })}
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5"><div className="flex items-center gap-2"><History className="h-4 w-4" /><h2 className="font-semibold">Regional audit</h2></div><div className="mt-3 space-y-3">{audits.length ? audits.map((audit) => <div className="rounded-lg bg-muted/40 p-3 text-sm" key={audit.id}><p>{formatBusinessDateTime(audit.changedAt, timezone, locale)}</p><p className="mt-1 text-xs text-muted-foreground">{Object.keys(audit.newValues).filter((key) => audit.previousValues[key] !== audit.newValues[key]).map((key) => `${key}: ${audit.previousValues[key]} → ${audit.newValues[key]}`).join(" · ")}</p></div>) : <p className="text-sm text-muted-foreground">No regional changes recorded yet.</p>}</div></section>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}><DialogContent><DialogHeader><DialogTitle>{editingProfile ? `New ${editingProfile.code} version` : "New tax profile"}</DialogTitle></DialogHeader><div className="space-y-4">{!editingProfile && <div className="space-y-1.5"><Label>Code</Label><Input value={draft.code} onChange={(event) => setDraft((value) => ({ ...value, code: event.target.value }))} placeholder="STANDARD" /></div>}<div className="space-y-1.5"><Label>Name</Label><Input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></div><div className="space-y-1.5"><Label>Rate (%)</Label><Input type="number" min="0" max="100" step="0.0001" value={draft.rate} onChange={(event) => setDraft((value) => ({ ...value, rate: event.target.value }))} /></div><div className="flex items-center justify-between rounded-lg border p-3"><div><Label>Prices include {taxLabel}</Label><p className="text-xs text-muted-foreground">Turn off when catalogue prices are before tax.</p></div><Checkbox checked={draft.priceIncludesTax} onCheckedChange={(checked) => setDraft((value) => ({ ...value, priceIncludesTax: checked === true }))} /></div><div className="space-y-1.5"><Label>Effective from</Label><Input type="datetime-local" value={draft.effectiveFrom} onChange={(event) => setDraft((value) => ({ ...value, effectiveFrom: event.target.value }))} /><p className="text-xs text-muted-foreground">Venue local time ({timezone}). Leave blank to apply immediately.</p></div><div className="space-y-1.5"><Label>Audit note</Label><Textarea value={draft.note} onChange={(event) => setDraft((value) => ({ ...value, note: event.target.value }))} placeholder="Why this treatment changed" /></div></div><DialogFooter><Button variant="outline" onClick={() => setProfileOpen(false)}>Cancel</Button><Button onClick={saveProfile} disabled={saving}>Save version</Button></DialogFooter></DialogContent></Dialog>

      <ConfirmationDialog open={Boolean(archiveProfile)} onOpenChange={(open) => !open && setArchiveProfile(null)} title="Archive tax profile?" description="Assigned menu or library items must be moved first. Historical order snapshots remain intact." confirmLabel="Archive" variant="destructive" onConfirm={async () => { if (!archiveProfile) return; try { await clientArchiveTaxProfile(archiveProfile.id); toast.success("Tax profile archived"); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not archive profile"); } finally { setArchiveProfile(null); } }} />
    </div>
  );
}
