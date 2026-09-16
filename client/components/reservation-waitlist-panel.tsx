"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Clock, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  calendarDateForSlot, formatSlotDate, formatSlotTime, venueLocalDateTimeToIso,
} from "@/lib/availability";
import {
  clientCreateReservationWaitlist, clientGetStaffReservationAvailability,
  clientGetReservationWaitlist, clientOfferReservationWaitlist,
  clientRemoveReservationWaitlist, clientRetryReservationWaitlistDelivery,
  ClientApiError,
} from "@/lib/client-api";
import type { CustomerResponse } from "@/lib/api-client";
import type { AvailabilitySlot, ReservationWaitlistEntry, ServiceType } from "@/types";

interface ReservationWaitlistPanelProps {
  initialEntries: ReservationWaitlistEntry[];
  businessId: string;
  businessTimezone: string;
  businessMaxGuests: number;
  serviceTypes: ServiceType[];
  customers: CustomerResponse[];
  /**
   * The server normalises a typed number against the VENUE's country before it
   * validates it, and its rejection says "the selected country" — a country
   * this form never showed. Naming it here is what makes that message usable.
   */
  businessCountryCode: string;
  /**
   * Every write below is `reservations.manage` on the server. Without this the
   * panel offered Add / Offer / Retry / Remove to any role that could merely
   * VIEW the book — four buttons that all came back 403.
   */
  canManage: boolean;
}

function displayEntryStatus(entry: ReservationWaitlistEntry, timezone: string) {
  if (entry.status === "offered" && entry.offerExpiresAt) {
    return `Offer expires ${formatSlotTime(entry.offerExpiresAt, timezone)}`;
  }
  return entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
}

export function ReservationWaitlistPanel({
  initialEntries, businessId, businessTimezone, businessMaxGuests, serviceTypes, customers, businessCountryCode, canManage,
}: ReservationWaitlistPanelProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [createOpen, setCreateOpen] = useState(false);
  const [offeringEntry, setOfferingEntry] = useState<ReservationWaitlistEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"active" | "history">("active");
  const [removeTarget, setRemoveTarget] = useState<ReservationWaitlistEntry | null>(null);
  const [removeReason, setRemoveReason] = useState("staff_removed");
  const [removeNote, setRemoveNote] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState(serviceTypes[0]?.id ?? "");
  const venueToday = useMemo(
    () => calendarDateForSlot(new Date().toISOString(), businessTimezone),
    [businessTimezone],
  );
  const [date, setDate] = useState(format(venueToday, "yyyy-MM-dd"));
  const [time, setTime] = useState("19:00");
  const [flexibility, setFlexibility] = useState("60");
  const [guests, setGuests] = useState("2");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsTimezone, setSlotsTimezone] = useState(businessTimezone);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  /**
   * Which field is wrong and why, rather than one toast naming four fields.
   * The old guard ORed seven conditions behind "Complete the guest, booking
   * type, party size, and requested time." — a message that did not mention
   * email (which it also required) and did mention the time (which is guarded
   * separately). An operator who tripped it on party size was told to check
   * three fields that were already correct.
   */
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => setEntries(initialEntries), [initialEntries]);

  const customerNames = useMemo(() => new Map(customers.map((customer) => [
    customer.id,
    customer.name || customer.phone || "Guest",
  ])), [customers]);
  const serviceById = useMemo(() => new Map(serviceTypes.map((service) => [service.id, service])), [serviceTypes]);
  const selectedService = serviceById.get(serviceTypeId);
  const maxGuests = Math.min(businessMaxGuests, selectedService?.capacity ?? businessMaxGuests);
  // WHICH limit is binding decides what the operator is told. "Bar Seating
  // seats 2" is actionable — pick another booking type; "this venue takes 8" is
  // a different fact with a different remedy.
  const capacityIsBinding =
    selectedService !== undefined && selectedService.capacity < businessMaxGuests;
  const partySizeCeiling = capacityIsBinding && selectedService
    ? `${selectedService.name} seats at most ${maxGuests}.`
    : `This venue takes at most ${maxGuests} on one booking.`;
  // The ceiling moves with the booking type. Without this, switching from an
  // 8-cover type to a 2-cover one left an invalid number sitting in the field
  // looking accepted, and the only signal was a toast on submit.
  useEffect(() => {
    setGuests((current) => {
      const count = Number(current);
      return Number.isInteger(count) && count > maxGuests ? String(maxGuests) : current;
    });
  }, [maxGuests]);

  const activeEntries = entries.filter((entry) => entry.status === "waiting" || entry.status === "offered");
  const visibleEntries = view === "active" ? activeEntries : entries.filter((entry) => entry.status !== "waiting" && entry.status !== "offered");

  const switchView = async (nextView: "active" | "history") => {
    setView(nextView);
    try { setEntries(await clientGetReservationWaitlist(nextView)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load waitlist history"); }
  };

  useEffect(() => {
    if (!offeringEntry) return;
    const requestDate = calendarDateForSlot(offeringEntry.requestedStartsAt, businessTimezone);
    const controller = new AbortController();
    setLoadingSlots(true);
    setSelectedSlot("");
    clientGetStaffReservationAvailability({
      serviceTypeId: offeringEntry.serviceTypeId,
      startDate: format(requestDate, "yyyy-MM-dd"),
      days: 1,
      guests: offeringEntry.guests,
      signal: controller.signal,
    }).then((availability) => {
      const preferred = new Date(offeringEntry.requestedStartsAt).getTime();
      const latest = new Date(offeringEntry.flexibleUntil).getTime();
      setSlots((availability.dates[0]?.slots ?? []).filter((slot) => {
        const instant = new Date(slot.startsAt).getTime();
        return instant >= preferred && instant <= latest;
      }));
      setSlotsTimezone(availability.timezone);
    }).catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "Could not load available times");
      }
      setSlots([]);
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingSlots(false);
    });
    return () => controller.abort();
  }, [businessTimezone, offeringEntry]);

  const resetCreateForm = () => {
    setServiceTypeId(serviceTypes[0]?.id ?? "");
    setDate(format(venueToday, "yyyy-MM-dd"));
    setTime("19:00"); setFlexibility("60"); setGuests("2");
    setName(""); setPhone(""); setEmail("");
  };

  /**
   * One failure, one field, one reason. Each branch says which control is wrong
   * and what would make it right; the party-size case names the limit AND where
   * the limit comes from, because "3 is too many" is a bug report and "Bar
   * Seating seats 2" is something a bartender can act on.
   */
  const validateCreate = (
    requestedStartsAt: string | null,
    guestCount: number,
  ): { field: string; message: string } | null => {
    if (!requestedStartsAt) {
      return { field: "time", message: "That time does not occur at the venue on this date." };
    }
    if (!serviceTypeId) {
      return { field: "serviceType", message: "Choose the booking type the guest is waiting for." };
    }
    if (!name.trim()) {
      return { field: "name", message: "Enter the guest's name." };
    }
    if (!phone.trim()) {
      return { field: "phone", message: "Enter a phone number — the offer is sent to it." };
    }
    if (!email.trim()) {
      return { field: "email", message: "Enter an email address." };
    }
    if (!Number.isInteger(guestCount) || guestCount < 1) {
      return { field: "guests", message: "Party size must be a whole number of guests." };
    }
    if (guestCount > maxGuests) {
      return {
        field: "guests",
        message: capacityIsBinding
          ? `${partySizeCeiling} Choose a different booking type, or a smaller party.`
          : partySizeCeiling,
      };
    }
    return null;
  };

  /** The one failing field's reason, rendered under that field. */
  const FieldFault = ({ field }: { field: string }) =>
    fieldError?.field === field ? (
      <p role="alert" className="text-[length:var(--ui-size)] text-critical-text">
        {fieldError.message}
      </p>
    ) : null;

  const createEntry = async () => {
    const selectedDate = new Date(`${date}T12:00:00`);
    const requestedStartsAt = venueLocalDateTimeToIso(selectedDate, time, businessTimezone);
    const guestCount = Number(guests);
    const invalid = validateCreate(requestedStartsAt, guestCount);
    if (invalid || !requestedStartsAt) {
      const failure = invalid ?? {
        field: "time",
        message: "That time does not occur at the venue on this date.",
      };
      setFieldError(failure);
      return toast.error(failure.message);
    }
    setFieldError(null);
    setSaving(true);
    try {
      const entry = await clientCreateReservationWaitlist({
        businessId, serviceTypeId, requestedStartsAt,
        flexibleUntil: new Date(new Date(requestedStartsAt).getTime() + Number(flexibility) * 60_000).toISOString(),
        guests: guestCount, name: name.trim(), phone: phone.trim(), email: email.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      setEntries((current) => [...current, entry]);
      setCreateOpen(false);
      resetCreateForm();
      toast.success("Guest added to the waitlist");
    } catch (error) {
      /**
       * The panel used to read only `error.message`, so two failures the server
       * describes precisely arrived as bare text with nothing to do about them.
       *
       * NOTE the 409 needs BOTH checks: `BOOKING_UNAVAILABLE` is also raised for
       * "the requested time is in the past", with the same code and no details.
       * `LIVE_SLOT_AVAILABLE` lives in `details.reason`, not in `code`.
       */
      if (error instanceof ClientApiError) {
        const details = (error.details ?? {}) as { reason?: string; field?: string };
        if (error.code === "BOOKING_UNAVAILABLE" && details.reason === "LIVE_SLOT_AVAILABLE") {
          const message =
            "That time is still free — book it instead. A guest can only be waitlisted for a window that is completely full.";
          setFieldError({ field: "time", message });
          toast.error(message);
          return;
        }
        if (error.code === "VALIDATION_ERROR" && details.field === "phone") {
          setFieldError({ field: "phone", message: error.message });
          toast.error(error.message);
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : "Could not add the guest");
    } finally { setSaving(false); }
  };

  const sendOffer = async () => {
    if (!offeringEntry || !selectedSlot) return;
    setSaving(true);
    try {
      const updated = await clientOfferReservationWaitlist(offeringEntry.id, selectedSlot);
      setEntries((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setOfferingEntry(null);
      if (updated.deliveryState === "delivered") toast.success("15-minute offer delivered to the guest");
      else if (updated.deliveryState === "failed") toast.warning("Offer created, but delivery failed. Retry from the active list.");
      else toast.info("Offer created. No configured delivery channel was available.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the offer");
    } finally { setSaving(false); }
  };

  const retryDelivery = async (entry: ReservationWaitlistEntry) => {
    try {
      const updated = await clientRetryReservationWaitlistDelivery(entry.id);
      setEntries((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (updated.deliveryState === "delivered") toast.success("Offer delivered.");
      else toast.warning("Delivery still failed; the offer remains active.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not retry delivery"); }
  };

  const removeEntry = async () => {
    if (!removeTarget || !removeReason.trim()) return;
    setSaving(true);
    try {
      const updated = await clientRemoveReservationWaitlist(removeTarget.id, removeReason.trim(), removeNote.trim() || undefined);
      setEntries((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
      setRemoveTarget(null); toast.success("Waitlist request moved to history.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove the request"); }
    finally { setSaving(false); }
  };

  return (
    /* A tab panel now, not a card stacked under the book: the tab strip carries
       the name this used to repeat in its own <h2>, and the border and the
       `mt-8` were separating it from a table that is no longer above it.
       Active/History stays — it filters WITHIN the waitlist and is not a peer
       of the tabs. */
    <div>
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-12)]">
        <p className="text-sm text-muted-foreground">Offer a live, matching slot one guest at a time. Offers expire after 15 minutes.</p>
        <div className="flex gap-[var(--space-8)]"><Button type="button" size="filter" variant={view === "active" ? "primary" : "secondary"} onClick={() => void switchView("active")}>Active</Button><Button type="button" size="filter" variant={view === "history" ? "primary" : "secondary"} onClick={() => void switchView("history")}>History</Button>{canManage && <Button type="button" size="filter" onClick={() => { resetCreateForm(); setCreateOpen(true); }}><Plus /> Add guest</Button>}</div>
      </div>
      <div className="mt-5 divide-y rounded-md border">
        {visibleEntries.length === 0 ? <p className="p-5 text-sm text-muted-foreground">{view === "active" ? "No active waitlist requests." : "No waitlist history yet."}</p> : visibleEntries.map((entry) => (
          <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0"><p className="font-medium">{customerNames.get(entry.customerId) || "Guest"} <span className="ml-1 text-sm font-normal text-muted-foreground">· {entry.guests} {entry.guests === 1 ? "guest" : "guests"}</span></p>
              <p className="mt-1 text-sm text-muted-foreground">{serviceById.get(entry.serviceTypeId)?.name || "Booking type"} · {formatSlotDate(entry.requestedStartsAt, businessTimezone)} · {formatSlotTime(entry.requestedStartsAt, businessTimezone)}–{formatSlotTime(entry.flexibleUntil, businessTimezone)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{displayEntryStatus(entry, businessTimezone)}{entry.deliveryState ? ` · delivery ${entry.deliveryState}` : ""}{entry.terminalReasonCode ? ` · ${entry.terminalReasonCode.replaceAll("_", " ")}` : ""}</p></div>
            {canManage && <div className="flex gap-[var(--space-8)]">{entry.status === "waiting" && <Button type="button" size="filter" variant="secondary" onClick={() => setOfferingEntry(entry)}><Send /> Offer slot</Button>}{entry.status === "offered" && entry.deliveryState !== "delivered" && <Button type="button" size="filter" variant="secondary" onClick={() => void retryDelivery(entry)}><RefreshCw /> Retry delivery</Button>}{(entry.status === "waiting" || entry.status === "offered") && <Button type="button" size="filter" variant="ghost" className="text-destructive" onClick={() => { setRemoveTarget(entry); setRemoveReason("staff_removed"); setRemoveNote(""); }}><Trash2 /> Remove</Button>}</div>}
          </div>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Add to waitlist</DialogTitle><DialogDescription>Record the guest&apos;s preferred venue-local time and how far later they can accept.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label htmlFor="waitlist-staff-name">Guest name</Label><Input id="waitlist-staff-name" value={name} aria-invalid={fieldError?.field === "name"} onChange={(event) => setName(event.target.value)} /><FieldFault field="name" /></div><div className="space-y-2"><Label htmlFor="waitlist-staff-phone">Phone</Label><Input id="waitlist-staff-phone" type="tel" value={phone} aria-invalid={fieldError?.field === "phone"} aria-describedby="waitlist-staff-phone-hint" onChange={(event) => setPhone(event.target.value)} /><p id="waitlist-staff-phone-hint" className="text-[length:var(--ui-size)] text-muted-foreground">Numbers are read as {businessCountryCode} unless written in full international form.</p><FieldFault field="phone" /></div><div className="space-y-2"><Label htmlFor="waitlist-staff-email">Email</Label><Input id="waitlist-staff-email" type="email" value={email} aria-invalid={fieldError?.field === "email"} onChange={(event) => setEmail(event.target.value)} /><FieldFault field="email" /></div>
          <div className="space-y-2"><Label htmlFor="waitlist-staff-service">Booking type</Label><Select value={serviceTypeId} onValueChange={setServiceTypeId}><SelectTrigger id="waitlist-staff-service"><SelectValue placeholder="Choose a booking type" /></SelectTrigger><SelectContent>{serviceTypes.map((service) => <SelectItem key={service.id} value={service.id}>{service.name}</SelectItem>)}</SelectContent></Select><FieldFault field="serviceType" /></div><div className="space-y-2"><Label htmlFor="waitlist-staff-guests">Party size</Label><Input id="waitlist-staff-guests" type="number" min={1} max={maxGuests} value={guests} aria-invalid={fieldError?.field === "guests"} aria-describedby="waitlist-staff-guests-hint" onChange={(event) => setGuests(event.target.value)} />{/* The ceiling BEFORE submission, and it moves with the booking type — `max` on a number input does not stop anyone typing past it. */}<p id="waitlist-staff-guests-hint" className="text-[length:var(--ui-size)] text-muted-foreground">{partySizeCeiling}</p><FieldFault field="guests" /></div>
          <div className="space-y-2"><Label htmlFor="waitlist-staff-date">Date</Label><Input id="waitlist-staff-date" type="date" min={format(venueToday, "yyyy-MM-dd")} value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="waitlist-staff-time">Preferred time</Label><Input id="waitlist-staff-time" type="time" value={time} aria-invalid={fieldError?.field === "time"} onChange={(event) => setTime(event.target.value)} /><FieldFault field="time" /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Can accept up to</Label><Select value={flexibility} onValueChange={setFlexibility}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="30">30 minutes later</SelectItem><SelectItem value="60">1 hour later</SelectItem><SelectItem value="90">90 minutes later</SelectItem></SelectContent></Select></div></div>
        <DialogFooter><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button><Button type="button" onClick={() => void createEntry()} disabled={saving}>{saving ? "Saving…" : "Add guest"}</Button></DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}><DialogContent><DialogHeader><DialogTitle>Remove waitlist request</DialogTitle><DialogDescription>This terminal action is retained in history.</DialogDescription></DialogHeader><div className="space-y-3"><Input placeholder="Required reason code" value={removeReason} onChange={(event) => setRemoveReason(event.target.value)} /><Textarea placeholder="Optional note" value={removeNote} onChange={(event) => setRemoveNote(event.target.value)} /></div><DialogFooter><Button onClick={() => setRemoveTarget(null)}>Keep request</Button><Button variant="destructive-quiet" onClick={() => void removeEntry()} disabled={saving || !removeReason.trim()}>Remove</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={offeringEntry !== null} onOpenChange={(open) => !open && setOfferingEntry(null)}><DialogContent><DialogHeader><DialogTitle>Offer a matching slot</DialogTitle><DialogDescription>{offeringEntry && `Only times from ${formatSlotTime(offeringEntry.requestedStartsAt, businessTimezone)} to ${formatSlotTime(offeringEntry.flexibleUntil, businessTimezone)} are eligible. The guest receives a 15-minute confirmation link.`}</DialogDescription></DialogHeader>
        {loadingSlots ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">Checking live availability…</div> : slots.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No live slots remain in this guest&apos;s requested window.</p> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{slots.map((slot) => <Button key={slot.startsAt} type="button" variant={selectedSlot === slot.startsAt ? "primary" : "secondary"} onClick={() => setSelectedSlot(slot.startsAt)} className="font-mono tabular-nums"><Clock />{formatSlotTime(slot.startsAt, slotsTimezone)}</Button>)}</div>}
        <DialogFooter><Button type="button" variant="secondary" onClick={() => setOfferingEntry(null)} disabled={saving}>Cancel</Button><Button type="button" onClick={() => void sendOffer()} disabled={!selectedSlot || saving}>{saving ? "Sending…" : "Send 15-minute offer"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
