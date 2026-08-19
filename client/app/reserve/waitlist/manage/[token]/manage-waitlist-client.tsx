"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clientCancelManagedWaitlist, clientGetManagedWaitlist } from "@/lib/client-api";
import type { ReservationWaitlistEntry } from "@/types";

export default function ManageWaitlistClient({ token }: { token: string }) {
  const [entry, setEntry] = useState<ReservationWaitlistEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setEntry(await clientGetManagedWaitlist(token)); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "This management link is no longer valid."); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const cancel = async () => {
    setBusy(true);
    try { setEntry(await clientCancelManagedWaitlist(token)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not cancel this request."); }
    finally { setBusy(false); }
  };
  const active = entry?.status === "waiting" || entry?.status === "offered";
  return <main className="theme-night grid min-h-screen place-items-center p-6"><section className="w-full max-w-md rounded-xl border bg-card p-7 text-center">{active ? <CheckCircle2 className="mx-auto size-10 text-brass" /> : <XCircle className="mx-auto size-10 text-muted-foreground" />}<h1 className="mt-4 font-display text-3xl">Waitlist request</h1>{!entry && !error ? <p className="mt-3 text-sm text-muted-foreground">Loading request…</p> : error ? <><p className="mt-3 text-sm text-destructive">{error}</p><Button className="mt-5" variant="outline" onClick={() => void load()}>Try again</Button></> : <><p className="mt-3 text-sm text-muted-foreground">Status: {entry?.status.replaceAll("_", " ")}</p>{active && <Button className="mt-6" variant="destructive" disabled={busy} onClick={() => void cancel()}>{busy ? "Cancelling…" : "Cancel waitlist request"}</Button>}</>}</section></main>;
}
