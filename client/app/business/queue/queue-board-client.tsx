"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Bell,
  Copy,
  Check,
  Wifi,
  WifiOff,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clientCreateStaffWalkIn,
  clientGetQueueEntries,
  clientGetQueueServiceDay,
  clientGetFloorPlanBoard,
  clientNotifyQueueEntry,
  clientOpenFloorPlanSeating,
  clientRemoveQueueEntry,
  clientRetryQueueDelivery,
  clientSetQueueServiceDay,
} from "@/lib/client-api";
import { useQueueSocket } from "@/hooks/use-queue-socket";
import type { FloorPlanBoardTable, FloorPlanParty, QueueEntry, QueueServiceDay } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FloorPlanSeatingSheet } from "@/components/floor-plan-seating-sheet";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min";
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Entry card ───────────────────────────────────────────────────────────────

function WaitingEntryCard({
  entry,
  onNotify,
  onSeat,
}: {
  entry: QueueEntry;
  onNotify: () => void;
  onSeat: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{entry.name}</p>
          {entry.phone && (
            <p className="text-xs text-muted-foreground mt-0.5">{entry.phone}</p>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          <Users className="h-3 w-3" />
          {entry.partySize}
        </span>
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3 shrink-0" />
        <span>Waiting {timeAgo(entry.joinedAt)}</span>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onNotify}>
          <Bell className="h-3.5 w-3.5" />
          Call party
        </Button>
        <Button
          size="sm"
          className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={onSeat}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Seat at table
        </Button>
      </div>
    </div>
  );
}

function CalledEntryCard({
  entry,
  onSeat,
  onRemove,
  onRetry,
}: {
  entry: QueueEntry;
  onSeat: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate">{entry.name}</p>
          {entry.phone && (
            <p className="text-xs text-muted-foreground mt-0.5">{entry.phone}</p>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          <Users className="h-3 w-3" />
          {entry.partySize}
        </span>
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <Bell className="h-3 w-3 shrink-0" />
          <span>Called · waiting for arrival</span>
        </div>
        <p className={cn(
          entry.delivery?.state === "delivered" ? "text-emerald-600" :
          entry.delivery?.state === "failed" ? "text-destructive" : "text-muted-foreground",
        )}>
          {entry.delivery?.state === "delivered" && `${entry.delivery.channel?.toUpperCase() ?? "Message"} delivered`}
          {entry.delivery?.state === "pending" && "Message delivery pending"}
          {entry.delivery?.state === "failed" && "Message failed — the party is still called"}
          {(!entry.delivery || entry.delivery.state === "unavailable") && "No configured delivery channel"}
        </p>
        {entry.delivery?.retryable && (
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3 w-3" /> Retry message
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
          onClick={onSeat}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Seated
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5 border-rose-400 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"
          onClick={onRemove}
        >
          <XCircle className="h-3.5 w-3.5" />
          No-show
        </Button>
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function QueueColumn({
  title,
  entries,
  emptyText,
  children,
}: {
  title: string;
  entries: QueueEntry[];
  emptyText: string;
  children: (entry: QueueEntry) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {entries.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {entries.length}
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 py-12 text-center">
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        entries.map((e) => <div key={e.id}>{children(e)}</div>)
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function QueueBoardClient({
  businessId,
  businessSlug,
  canOverride,
}: {
  businessId: string;
  businessSlug: string;
  canOverride: boolean;
}) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [service, setService] = useState<QueueServiceDay | null>(null);
  const [coverCap, setCoverCap] = useState(40);
  const [policySaving, setPolicySaving] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPartySize, setWalkInPartySize] = useState(2);
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<QueueEntry | null>(null);
  const [removeReason, setRemoveReason] = useState<"guest_left" | "no_show" | "staff_removed">("no_show");
  const [removeNote, setRemoveNote] = useState("");
  const [seatingTarget, setSeatingTarget] = useState<QueueEntry | null>(null);
  const [floorTables, setFloorTables] = useState<FloorPlanBoardTable[]>([]);
  const [seatingLoading, setSeatingLoading] = useState(false);

  const { connected } = useQueueSocket(businessId, (updated) => {
    setEntries(updated);
  });

  const refresh = useCallback(async () => {
    try {
      const [nextEntries, nextService] = await Promise.all([
        clientGetQueueEntries(businessId),
        clientGetQueueServiceDay(),
      ]);
      setEntries(nextEntries);
      setService(nextService);
      setCoverCap(nextService.maxWaitingCovers ?? 40);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load queue.");
    }
  }, [businessId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (connected) void refresh(); }, [connected, refresh]);

  const waiting = entries.filter((e) => e.status === "waiting");
  const called = entries.filter((e) => e.status === "called");

  const handleNotify = async (entry: QueueEntry) => {
    try {
      const updated = await clientNotifyQueueEntry(businessId, entry.id);
      setEntries((prev) => prev.map((current) => current.id === updated.id ? updated : current));
      if (updated.delivery?.state === "delivered") toast.success("Party called and message delivered.");
      else if (updated.delivery?.state === "failed") toast.warning("Party called, but the message failed.");
      else toast.info("Party called. No delivery channel was available.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not call this party.");
    }
  };

  const openSeating = async (entry: QueueEntry) => {
    setSeatingTarget(entry);
    try {
      const board = await clientGetFloorPlanBoard();
      setFloorTables(board.areas.flatMap((area) => area.tables));
    } catch {
      toast.error("Could not load available tables.");
    }
  };

  const confirmSeating = async (tableIds: string[], capacityOverrideReason?: string) => {
    if (!seatingTarget) return;
    setSeatingLoading(true);
    try {
      await clientOpenFloorPlanSeating({
        sourceType: "queue",
        sourceId: seatingTarget.id,
        tableIds,
        capacityOverrideReason,
      });
      setSeatingTarget(null);
      setEntries(await clientGetQueueEntries(businessId));
      toast.success(`${seatingTarget.name} is seated.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not seat this party.");
    } finally {
      setSeatingLoading(false);
    }
  };

  const seatingParty: FloorPlanParty | null = seatingTarget
    ? {
        sourceType: "queue",
        sourceId: seatingTarget.id,
        name: seatingTarget.name,
        partySize: seatingTarget.partySize,
        status: seatingTarget.status,
        assignedTableIds: [],
      }
    : null;

  const handleRemove = (entry: QueueEntry) => {
    setRemoveTarget(entry);
    setRemoveReason(entry.status === "called" ? "no_show" : "staff_removed");
    setRemoveNote("");
  };

  const confirmRemove = async (entry: QueueEntry) => {
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      await clientRemoveQueueEntry(businessId, entry.id, removeReason, removeNote.trim() || undefined);
    } catch {
      setEntries((prev) => [...prev, entry]);
      toast.error("Could not remove this party.");
    }
  };

  const updatePolicy = async (status: "open" | "closed") => {
    setPolicySaving(true);
    try {
      const next = await clientSetQueueServiceDay(status, coverCap);
      setService(next);
      toast.success(status === "open" ? "Queue opened for this service day." : "Queue closed to new parties.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the queue policy.");
    } finally { setPolicySaving(false); }
  };

  const addWalkIn = async () => {
    if (!walkInName.trim() || walkInPartySize < 1) return;
    setWalkInSaving(true);
    try {
      const result = await clientCreateStaffWalkIn({
        name: walkInName.trim(),
        partySize: walkInPartySize,
        phone: walkInPhone.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setEntries((current) => [...current.filter((entry) => entry.id !== result.entry.id), result.entry]);
      setWalkInName(""); setWalkInPhone(""); setWalkInPartySize(2);
      setService(await clientGetQueueServiceDay());
      toast.success("Walk-in added to the queue.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the walk-in.");
    } finally { setWalkInSaving(false); }
  };

  const retryDelivery = async (entry: QueueEntry) => {
    try {
      const updated = await clientRetryQueueDelivery(entry.id);
      setEntries((current) => current.map((item) => item.id === updated.id ? updated : item));
      if (updated.delivery?.state === "delivered") toast.success("Message delivered.");
      else toast.warning("Message delivery failed again. The party remains called.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry delivery.");
    }
  };

  const queueUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/queue/${businessSlug}`
      : `/queue/${businessSlug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(queueUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = queueUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {connected ? (
              <Wifi className="h-4 w-4 text-emerald-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span
              className={cn(
                "text-xs font-medium",
                connected ? "text-emerald-600" : "text-muted-foreground",
              )}
            >
              {connected ? "Live" : "Connecting…"}
            </span>
          </div>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">
            {waiting.length + called.length} active{" "}
            {waiting.length + called.length === 1 ? "party" : "parties"}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied!" : "Copy queue link"}
        </Button>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <section className="grid gap-4 rounded-xl border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <div>
            <p className="font-medium">Current service queue</p>
            <p className="text-xs text-muted-foreground">{service?.serviceDate ?? "Loading…"} · {service?.waitingCovers ?? 0} waiting covers</p>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="queue-cover-cap">Waiting-cover cap</Label>
              <Input id="queue-cover-cap" type="number" min={1} max={1000} value={coverCap} onChange={(event) => setCoverCap(Number(event.target.value))} />
            </div>
            <Button disabled={policySaving || coverCap < 1} onClick={() => void updatePolicy(service?.isOpen ? "closed" : "open")}>
              {service?.isOpen ? "Close queue" : "Open queue"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {service?.isOpen ? (service.isFull ? "Open, but currently full." : "Open to new walk-ins.") : "Closed to new walk-ins; current parties remain operable."}
            {service?.estimatedWaitMinutes !== undefined ? ` Measured estimate: ${service.estimatedWaitMinutes} min.` : " No measured estimate yet."}
          </p>
        </div>
        <div className="space-y-3 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
          <p className="font-medium">Add staff walk-in</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]">
            <Input aria-label="Guest name" placeholder="Guest name" value={walkInName} onChange={(event) => setWalkInName(event.target.value)} />
            <Input aria-label="Party size" type="number" min={1} max={20} value={walkInPartySize} onChange={(event) => setWalkInPartySize(Number(event.target.value))} />
            <Input aria-label="Phone, optional" placeholder="Phone (optional)" value={walkInPhone} onChange={(event) => setWalkInPhone(event.target.value)} />
            <Button disabled={walkInSaving || !service?.isOpen || service?.isFull || !walkInName.trim()} onClick={() => void addWalkIn()}><Plus className="mr-1 h-4 w-4" />Add</Button>
          </div>
        </div>
      </section>

      {/* Empty state */}
      {!loadError && waiting.length === 0 && called.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">Queue is empty</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Share{" "}
            <button
              type="button"
              className="text-primary underline underline-offset-2"
              onClick={() => void handleCopy()}
            >
              the queue link
            </button>{" "}
            to get started.
          </p>
        </div>
      )}

      {/* Board */}
      {(waiting.length > 0 || called.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          <QueueColumn title="Waiting" entries={waiting} emptyText="No parties waiting">
            {(entry) => (
              <WaitingEntryCard
                entry={entry}
                onNotify={() => void handleNotify(entry)}
                onSeat={() => void openSeating(entry)}
              />
            )}
          </QueueColumn>

          <QueueColumn title="Called" entries={called} emptyText="No parties called yet">
            {(entry) => (
              <CalledEntryCard
                entry={entry}
                onSeat={() => void openSeating(entry)}
                onRemove={() => handleRemove(entry)}
                onRetry={() => void retryDelivery(entry)}
              />
            )}
          </QueueColumn>
        </div>
      )}

      {removeTarget && (
        <section className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg space-y-3 rounded-xl border bg-background p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="Remove queue party">
          <div><p className="font-semibold">Remove {removeTarget.name}</p><p className="text-sm text-muted-foreground">Choose the operational reason. This is retained in queue history.</p></div>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={removeReason} onChange={(event) => setRemoveReason(event.target.value as typeof removeReason)}>
            <option value="guest_left">Guest left</option><option value="no_show">No-show</option><option value="staff_removed">Staff removed</option>
          </select>
          <Input placeholder="Optional note" value={removeNote} onChange={(event) => setRemoveNote(event.target.value)} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRemoveTarget(null)}>Keep party</Button><Button variant="destructive" onClick={() => { void confirmRemove(removeTarget); setRemoveTarget(null); }}>Remove party</Button></div>
        </section>
      )}
      <FloorPlanSeatingSheet
        key={seatingTarget?.id ?? "no-queue-party"}
        open={seatingTarget !== null}
        onOpenChange={(open) => !open && setSeatingTarget(null)}
        party={seatingParty}
        tables={floorTables}
        canOverride={canOverride}
        submitting={seatingLoading}
        onConfirm={(tableIds, reason) => void confirmSeating(tableIds, reason)}
      />
    </div>
  );
}
