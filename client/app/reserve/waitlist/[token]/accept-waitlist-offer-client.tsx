"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clientAcceptWaitlistOffer, clientDeclineWaitlistOffer, clientExchangePublicCapability, clientGetBusiness, clientGetWaitlistOffer } from "@/lib/client-api";
import { consumeCapabilityFragment } from "@/lib/capability-fragment";
import { formatBusinessDateTime } from "@/lib/business-time";
import type { ReservationWaitlistEntry } from "@/types";

export default function AcceptWaitlistOfferClient() {
  const [entry, setEntry] = useState<ReservationWaitlistEntry | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setEntry(await clientGetWaitlistOffer()); setLoadError(null); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "This offer link is no longer available."); }
  }, []);
  useEffect(() => {
    const token = consumeCapabilityFragment();
    const exchange = token ? clientExchangePublicCapability("waitlist_offer", token) : Promise.resolve();
    void exchange.then(load).catch((error) => setLoadError(error instanceof Error ? error.message : "This offer link is no longer available."));
  }, [load]);

  async function accept() {
    setSubmitting(true); setMessage(null);
    try {
      const reservation = await clientAcceptWaitlistOffer();
      const business = await clientGetBusiness(reservation.businessId).catch(() => null);
      setMessage(`Your reservation is confirmed for ${formatBusinessDateTime(reservation.time, business?.timezone ?? "UTC", business?.locale)}.`);
      setEntry((current) => current ? { ...current, status: "accepted", acceptedReservationId: reservation.id } : current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Capacity changed and this offer could not be accepted."); }
    finally { setSubmitting(false); }
  }

  async function decline() {
    setSubmitting(true); setMessage(null);
    try { setEntry(await clientDeclineWaitlistOffer()); setMessage("You declined this offer. The venue has been updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not decline this offer."); }
    finally { setSubmitting(false); }
  }

  const terminal = entry && entry.status !== "offered";
  return <main className="grid min-h-screen place-items-center p-6"><section className="w-full max-w-md border bg-card p-7 text-center">
    {entry?.status === "accepted" ? <CheckCircle2 className="mx-auto size-10 text-primary" /> : terminal || loadError ? <XCircle className="mx-auto size-10 text-muted-foreground" /> : <Clock className="mx-auto size-10 text-muted-foreground" />}
    <h1 className="mt-4 type-d3">{!entry && !loadError ? "Checking your offer…" : entry?.status === "offered" ? "A table is available" : entry?.status === "accepted" ? "Already accepted" : entry?.status === "expired" ? "Offer expired" : entry?.status === "declined" ? "Offer declined" : "Offer unavailable"}</h1>
    <p className="mt-3 text-sm text-muted-foreground">{entry?.status === "offered" ? "Accept before the private offer expires. Availability is rechecked when you confirm." : loadError ?? message ?? (entry?.status === "accepted" ? "Your reservation was already created; retrying acceptance will not create another one." : "This offer can no longer create a reservation.")}</p>
    {entry?.status === "offered" && <div className="mt-6 flex justify-center gap-2"><Button variant="secondary" onClick={() => void decline()} disabled={submitting}>Decline</Button><Button onClick={() => void accept()} disabled={submitting}>{submitting ? "Working…" : "Accept reservation"}</Button></div>}
    {message && entry?.status === "offered" && <p className="mt-5 text-sm" role="status">{message}</p>}
    {loadError && <Button className="mt-5" variant="secondary" onClick={() => void load()}>Try again</Button>}
  </section></main>;
}
