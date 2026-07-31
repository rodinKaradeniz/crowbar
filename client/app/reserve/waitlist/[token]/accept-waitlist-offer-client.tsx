"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clientAcceptWaitlistOffer } from "@/lib/client-api";

export default function AcceptWaitlistOfferClient({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  async function accept() {
    setSubmitting(true); setMessage(null);
    try { const reservation = await clientAcceptWaitlistOffer(token); setMessage(`Your table is confirmed for ${new Date(reservation.time).toLocaleString()}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "This offer is no longer available."); }
    finally { setSubmitting(false); }
  }
  return <main className="theme-night min-h-screen grid place-items-center p-6"><section className="w-full max-w-md rounded-xl border bg-card p-7 text-center"><CheckCircle2 className="mx-auto size-10 text-brass" /><h1 className="mt-4 font-display text-3xl">A table is available</h1><p className="mt-3 text-sm text-muted-foreground">Accept the reservation before this private offer expires.</p>{message ? <p className="mt-5 text-sm" role="status">{message}</p> : <Button className="mt-6" onClick={() => void accept()} disabled={submitting}>{submitting ? "Accepting…" : "Accept reservation"}</Button>}</section></main>;
}
