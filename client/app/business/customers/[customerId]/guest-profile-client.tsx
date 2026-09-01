"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, GitMerge, Plus, Save, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonList } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import {
  clientAddGuestNote,
  clientAddGuestTag,
  clientExportGuest,
  clientGetGuestProfile,
  clientListGuests,
  clientMergeGuest,
  clientRemoveGuestTag,
  clientRequestGuestDeletion,
  clientUpdateGuestProfile,
} from "@/lib/client-api";
import type { GuestListItem, GuestProfile } from "@/types";
import { formatMoney } from "@/lib/money";
import { formatBusinessDate, formatBusinessDateTime } from "@/lib/business-time";
import { useRegionalSettings } from "@/contexts/regional-context";

const SUGGESTED_TAGS = ["VIP", "Regular", "No-show risk", "Birthday"];

export default function GuestProfileClient({ customerId, canManage, businessTimezone }: { customerId: string; canManage: boolean; businessTimezone: string }) {
  const { currencyCode, locale } = useRegionalSettings();
  const money = (value?: number) => value === undefined ? null : formatMoney(value, currencyCode, locale);
  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [mergeCandidates, setMergeCandidates] = useState<GuestListItem[]>([]);

  const refresh = useCallback(async () => {
    try { setGuest(await clientGetGuestProfile(customerId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load guest profile."); }
    finally { setLoading(false); }
  }, [customerId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const dietaryDetails = String(form.get("dietaryDetails") || "").trim();
      setGuest(await clientUpdateGuestProfile(customerId, {
        name: String(form.get("name") || "").trim() || undefined,
        email: String(form.get("email") || "").trim() || undefined,
        dateOfBirth: String(form.get("dateOfBirth") || "") || null,
        preferences: String(form.get("preferences") || "").trim() || null,
        dietaryDetails: dietaryDetails || null,
        saveDietaryDetails: dietaryDetails ? form.get("saveDietaryDetails") === "on" : undefined,
      }));
      toast.success("Guest profile saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save guest profile."); }
    finally { setBusy(false); }
  };

  const addTag = async (name = tag) => {
    if (!name.trim()) return;
    setBusy(true);
    try { await clientAddGuestTag(customerId, name.trim()); setTag(""); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not add tag."); }
    finally { setBusy(false); }
  };

  const addNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!noteTitle.trim() || !noteBody.trim()) return;
    setBusy(true);
    try { await clientAddGuestNote(customerId, noteTitle.trim(), noteBody.trim()); setNoteTitle(""); setNoteBody(""); await refresh(); toast.success("Team note added."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not add note."); }
    finally { setBusy(false); }
  };

  const downloadExport = async () => {
    setBusy(true);
    try {
      const exported = await clientExportGuest(customerId);
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `guest-${customerId}.json`; anchor.click(); URL.revokeObjectURL(url);
      toast.success("Guest export downloaded.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not export guest data."); }
    finally { setBusy(false); }
  };

  const loadMergeCandidates = async () => {
    try { setMergeCandidates((await clientListGuests()).filter((candidate) => candidate.id !== customerId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load guests to merge."); }
  };

  const mergeGuest = async (sourceCustomerId: string) => {
    setBusy(true);
    try { setGuest(await clientMergeGuest(customerId, sourceCustomerId)); setMergeCandidates([]); toast.success("Guest profiles merged."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not merge guest profiles."); }
    finally { setBusy(false); }
  };

  if (loading) return (
    <div className="flex flex-col gap-6 px-[clamp(16px,2.5vw,32px)] py-6">
      <Skeleton className="h-[var(--t1-size)] w-56" />
      <Skeleton className="h-[1em] w-80" index={1} />
      <SkeletonList rows={6} columns={["w-[30%]", "w-[20%]", "w-[18%]", "w-[14%]"]} />
    </div>
  );
  if (!guest) return <div className="px-[clamp(16px,2.5vw,32px)] py-6"><Link className="text-sm underline" href="/business/customers">Back to customers</Link><p className="mt-6 text-muted-foreground">Guest profile not found.</p></div>;

  return <div className="flex flex-col gap-6 px-[clamp(16px,2.5vw,32px)] py-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/business/customers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 size-4" /> Guests</Link><h1 className="type-t1 mt-3">{guest.name ?? "Guest"}</h1><p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">One business-scoped hospitality profile and operational history.</p></div>
      {canManage && <div className="flex gap-2"><Button variant="secondary" size="filter" onClick={() => void downloadExport()} disabled={busy}><Download /> Export</Button><Button variant="secondary" size="filter" onClick={() => setDeleteOpen(true)} disabled={busy}><Trash2 /> Anonymise</Button></div>}
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <section className="border bg-card p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Guest details</h2>{/* Neutral. §08 names dietary notes as the case that does NOT
              qualify — it is information the host needs before seating,
              carried by the word, not by red. */}
          {guest.dietaryDetails && <Badge tone="neutral">Dietary note</Badge>}</div>
          <form className="mt-5 space-y-4" onSubmit={saveProfile}>
            <div className="grid gap-3 sm:grid-cols-2"><Input name="name" defaultValue={guest.name} placeholder="Guest name" aria-label="Guest name" /><Input name="email" type="email" defaultValue={guest.email} placeholder="Email" aria-label="Guest email" /></div>
            <div className="grid gap-3 sm:grid-cols-2"><Input value={guest.phone ?? ""} readOnly aria-label="Guest phone" /><Input name="dateOfBirth" type="date" defaultValue={guest.dateOfBirth} aria-label="Optional date of birth" /></div>
            <Textarea name="preferences" defaultValue={guest.preferences} placeholder="Preferences, seating requests, favourite drinks…" aria-label="Guest preferences" />
            <Textarea name="dietaryDetails" defaultValue={guest.dietaryDetails} placeholder="Allergy or dietary detail, only when the guest asked to retain it" aria-label="Dietary or allergy details" />
            <label className="flex items-start gap-2 text-sm"><input name="saveDietaryDetails" type="checkbox" defaultChecked={Boolean(guest.dietaryDetails)} className="mt-0.5" /><span>The guest asked us to save this for future visits.</span></label>
            <Button type="submit" disabled={busy}><Save /> Save details</Button>
          </form>
        </section>

        <section className="border bg-card p-5"><h2 className="font-semibold">Guest timeline</h2><div className="mt-4 divide-y">{guest.timeline.length ? guest.timeline.map((entry) => <div className="flex items-start justify-between gap-4 py-3" key={entry.id}><div><p className="text-sm font-medium">{entry.title}</p>{entry.detail && <p className="mt-0.5 text-sm text-muted-foreground">{entry.detail}</p>}<p className="mt-1 text-xs text-muted-foreground">{formatBusinessDateTime(entry.occurredAt, businessTimezone, locale)}{entry.status ? ` · ${entry.status}` : ""}</p></div>{money(entry.amount) && <span className="font-mono tabular-nums text-sm">{money(entry.amount)}</span>}</div>) : <p className="py-6 text-sm text-muted-foreground">No guest activity yet.</p>}</div></section>

        <section className="border bg-card p-5"><h2 className="font-semibold">Team notes</h2><form className="mt-4 space-y-3" onSubmit={addNote}><Input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Note title" /><Textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Add a useful service note" /><Button type="submit" size="filter" disabled={busy || !noteTitle.trim() || !noteBody.trim()}><Plus /> Add note</Button></form><div className="mt-5 space-y-3">{guest.notes.map((note) => <article className="bg-muted/40 p-3" key={note.id}><p className="text-sm font-medium">{note.title}</p><p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p><p className="mt-2 text-xs text-muted-foreground">Created {formatBusinessDateTime(note.createdAt, businessTimezone, locale)} · last edited {formatBusinessDateTime(note.updatedAt, businessTimezone, locale)}</p></article>)}</div></section>
      </div>

      <aside className="space-y-6">
        <section className="border bg-card p-5"><h2 className="flex items-center gap-2 font-semibold"><Tags className="size-4" /> Tags</h2><div className="mt-3 flex flex-wrap gap-2">{guest.tags.map((item) => <button key={item.id} type="button" className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => void clientRemoveGuestTag(customerId, item.id).then(refresh)}>{item.name} ×</button>)}</div><div className="mt-4 flex gap-2"><Input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="Custom tag" /><Button size="icon" aria-label="Add tag" disabled={busy} onClick={() => void addTag()}><Plus /></Button></div><div className="mt-3 flex flex-wrap gap-2">{SUGGESTED_TAGS.filter((name) => !guest.tags.some((item) => item.name.toLowerCase() === name.toLowerCase())).map((name) => <Button key={name} size="filter" variant="secondary" disabled={busy} onClick={() => void addTag(name)}>{name}</Button>)}</div></section>
        <section className="border bg-card p-5"><h2 className="font-semibold">Marketing consent</h2><div className="mt-3 space-y-3 text-sm">{guest.consents.length ? guest.consents.map((consent) => <div key={consent.channel}><p className="font-medium capitalize">{consent.channel}</p><p className="text-muted-foreground">{consent.isConsented ? "Opted in" : "Not opted in"} · {formatBusinessDate(consent.capturedAt, businessTimezone, locale)}</p></div>) : <p className="text-muted-foreground">No marketing consent recorded.</p>}</div></section>
        {canManage && <section className="border bg-card p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Reconcile duplicate</h2><Button size="filter" variant="secondary" onClick={() => void loadMergeCandidates()} disabled={busy}><GitMerge /> Find guest</Button></div>{mergeCandidates.length > 0 && <div className="mt-3 space-y-2">{mergeCandidates.map((candidate) => <div key={candidate.id} className="flex items-center justify-between gap-2 bg-muted/40 p-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{candidate.name ?? "Unnamed guest"}</p><p className="truncate text-xs text-muted-foreground">{candidate.phone ?? candidate.email ?? candidate.id}</p></div><Button size="filter" variant="secondary" disabled={busy} onClick={() => void mergeGuest(candidate.id)}>Merge</Button></div>)}</div>}<p className="mt-3 text-xs text-muted-foreground">The selected duplicate is anonymised and its operational history moves here.</p></section>}
        <section className="border bg-muted/30 p-5 text-sm text-muted-foreground"><p className="font-medium text-foreground">Privacy</p><p className="mt-2">Profiles are anonymised after 24 months of inactivity, unless a venue has a lawful retention obligation. Marketing consent is separate from reservation messages.</p></section>
      </aside>
    </div>
    <ConfirmationDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Anonymise this guest?" description="Contact details, notes, preferences, dietary details, tags, and marketing consent will be removed. Anonymous operational history remains." confirmLabel="Anonymise guest" variant="destructive" onConfirm={() => void clientRequestGuestDeletion(customerId).then(() => { toast.success("Guest data anonymised."); window.location.assign("/business/customers"); }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not anonymise guest."))} />
  </div>;
}
