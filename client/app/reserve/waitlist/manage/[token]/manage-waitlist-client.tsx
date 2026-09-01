"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clientCancelManagedWaitlist, clientExchangePublicCapability, clientGetManagedWaitlist } from "@/lib/client-api";
import { consumeCapabilityFragment } from "@/lib/capability-fragment";
import type { ReservationWaitlistEntry } from "@/types";

export default function ManageWaitlistClient() {
  const [entry, setEntry] = useState<ReservationWaitlistEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setEntry(await clientGetManagedWaitlist()); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "This management link is no longer valid."); }
  }, []);
  useEffect(() => {
    const token = consumeCapabilityFragment();
    const exchange = token ? clientExchangePublicCapability("waitlist_manage", token) : Promise.resolve();
    void exchange.then(load).catch((caught) => setError(caught instanceof Error ? caught.message : "This management link is no longer valid."));
  }, [load]);
  const cancel = async () => {
    setBusy(true);
    try { setEntry(await clientCancelManagedWaitlist()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not cancel this request."); }
    finally { setBusy(false); }
  };
  const active = entry?.status === "waiting" || entry?.status === "offered";
  return <main className="grid min-h-screen place-items-center p-6"><section className="w-full max-w-md border bg-card p-7 text-center">{active ? <CheckCircle2 className="mx-auto size-10 text-muted-foreground" /> : <XCircle className="mx-auto size-10 text-muted-foreground" />}<h1 className="mt-4 type-d3">Waitlist request</h1>{!entry && !error ? <p className="mt-3 text-sm text-muted-foreground">Loading request…</p> : error ? <><p className="mt-3 text-[length:var(--ui-size)] text-critical-text">{error}</p><Button className="mt-5" variant="secondary" onClick={() => void load()}>Try again</Button></> : <><p className="mt-3 text-sm text-muted-foreground">Status: {entry?.status.replaceAll("_", " ")}</p>{active && <Button className="mt-6" variant="secondary" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel waitlist request"}</Button>}</>}</section></main>;
}
