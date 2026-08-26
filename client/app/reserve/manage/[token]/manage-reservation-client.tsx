"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clientCancelPublicReservation,
  clientExchangePublicCapability,
  clientGetAvailability,
  clientGetBusiness,
  clientGetPublicManagedReservation,
  clientReconfirmPublicReservation,
  clientReschedulePublicReservation,
} from "@/lib/client-api";
import { consumeCapabilityFragment } from "@/lib/capability-fragment";
import type { Availability, Reservation } from "@/types";
import type { Business } from "@/types";
import { formatBusinessDateTime, formatBusinessTime } from "@/lib/business-time";
import { GuestPrivacySection } from "./guest-privacy-section";

export default function ManageReservationClient() {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState(1);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = consumeCapabilityFragment();
    const exchange = token
      ? clientExchangePublicCapability("reservation", token)
      : Promise.resolve();
    void exchange.then(() => clientGetPublicManagedReservation())
      .then(async (value) => {
        setBusiness(await clientGetBusiness(value.businessId).catch(() => null));
        setReservation(value);
        setGuests(value.guests);
        setDate(value.time.slice(0, 10));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "This reservation link is unavailable."))
      .finally(() => setLoading(false));
  }, []);

  const slots = useMemo(() => availability?.dates.flatMap((item) => item.slots) ?? [], [availability]);

  async function loadAvailability() {
    if (!reservation || !date) return;
    setAction("slots"); setError(null);
    try {
      setAvailability(await clientGetAvailability({
        businessId: reservation.businessId, serviceTypeId: reservation.serviceTypeId,
        startDate: date, days: 1, guests,
      }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load available times."); }
    finally { setAction(null); }
  }

  async function run(kind: "cancel" | "reconfirm") {
    setAction(kind); setError(null);
    try {
      setReservation(kind === "cancel" ? await clientCancelPublicReservation() : await clientReconfirmPublicReservation());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update reservation."); }
    finally { setAction(null); }
  }

  async function reschedule(time: string) {
    if (!reservation) return;
    setAction(time); setError(null);
    try { setReservation(await clientReschedulePublicReservation({ serviceTypeId: reservation.serviceTypeId, time, guests })); setAvailability(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "That time is no longer available."); }
    finally { setAction(null); }
  }

  if (loading) return <main className="theme-night min-h-screen grid place-items-center p-6 text-sm text-muted-foreground">Loading reservation…</main>;
  if (!reservation) return <main className="theme-night min-h-screen grid place-items-center p-6"><div className="max-w-md text-center"><h1 className="font-display text-3xl">Reservation unavailable</h1><p className="mt-3 text-sm text-muted-foreground">{error ?? "This link is invalid or has been replaced."}</p></div></main>;

  const active = reservation.status === "pending" || reservation.status === "confirmed";
  return <main className="theme-night min-h-screen p-5 sm:p-10"><section className="mx-auto max-w-xl rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
    <p className="eyebrow text-brass">Reservation</p>
    <h1 className="mt-2 font-display text-3xl">Manage your booking</h1>
    <p className="mt-4 text-sm text-muted-foreground">{formatBusinessDateTime(reservation.time, business?.timezone ?? "UTC", business?.locale)} · {reservation.guests} guests</p>
    <p className="mt-2 text-sm capitalize">Status: <strong>{reservation.status.replace("_", " ")}</strong>{reservation.cancelledLate ? " (late cancellation)" : ""}</p>
    {reservation.reconfirmedAt && <p className="mt-2 flex items-center gap-2 text-sm text-emerald-500"><CheckCircle2 className="size-4" /> You&apos;re reconfirmed.</p>}
    {error && <p role="alert" className="mt-4 rounded-md border border-oxblood/40 p-3 text-sm text-rose-500">{error}</p>}
    {active && <div className="mt-6 flex flex-wrap gap-3">
      <Button onClick={() => void run("reconfirm")} disabled={action !== null}><CheckCircle2 /> {action === "reconfirm" ? "Saving…" : "I’m still coming"}</Button>
      <Button variant="outline" onClick={() => void run("cancel")} disabled={action !== null}><X /> {action === "cancel" ? "Cancelling…" : "Cancel reservation"}</Button>
    </div>}
    {active && <section className="mt-8 border-t pt-6"><h2 className="font-semibold">Reschedule</h2><p className="mt-1 text-sm text-muted-foreground">Choose a date and we&apos;ll show live available times.</p>
      <div className="mt-4 flex flex-wrap gap-3"><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-auto" /><Input type="number" min="1" value={guests} onChange={(event) => setGuests(Number(event.target.value))} className="w-24" aria-label="Guests" /><Button variant="outline" onClick={() => void loadAvailability()} disabled={action !== null}><CalendarClock /> {action === "slots" ? "Loading…" : "Find times"}</Button></div>
      {availability && <div className="mt-4 flex flex-wrap gap-2">{slots.length ? slots.map((slot) => <Button key={slot.startsAt} size="sm" variant="outline" disabled={action !== null} onClick={() => void reschedule(slot.startsAt)}>{formatBusinessTime(slot.startsAt, business?.timezone ?? "UTC", business?.locale)}</Button>) : <p className="text-sm text-muted-foreground">No times are available that day.</p>}</div>}
    </section>}
    <GuestPrivacySection />
  </section></main>;
}
