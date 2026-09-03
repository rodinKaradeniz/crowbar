"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { OfflineBar } from "@/components/offline-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServiceClock } from "@/hooks/use-service-clock";
import { deliverySeverity } from "@/lib/severity";
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
import { toast } from "sonner";
import { FloorPlanSeatingSheet } from "@/components/floor-plan-seating-sheet";
import { PageBody, PageHeader } from "@/components/page-header";

/**
 * How long a party has been waiting. NEUTRAL, always.
 *
 * "A guest waiting past the time they were quoted" is one of the four critical
 * cases — and `QueueEntry` stores no quote-at-join. `measured_wait_estimate` is
 * a live board-level median that moves during service, so comparing one party's
 * wait to the CURRENT estimate would be a different claim than the design
 * makes. The figure is shown; the colour is not earned. See
 * `queueWaitSeverity()` and `docs/TODO.md` §7a.
 */
function waitedFor(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min";
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Entry card ───────────────────────────────────────────────────────────────

function PartyRow({
  entry,
  now,
  children,
}: {
  entry: QueueEntry;
  now: number;
  children: React.ReactNode;
}) {
  return (
    <article className="border border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-surface-3 px-3.5 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{entry.name}</p>
          {entry.phone ? (
            <p className="mt-0.5 font-mono text-[12.5px] text-muted-foreground">
              {entry.phone}
            </p>
          ) : null}
        </div>
        <Badge tone="neutral">×{entry.partySize}</Badge>
      </div>

      <div className="px-3.5 py-3">
        <p className="font-mono text-[12.5px] tabular-nums text-muted-foreground">
          Waiting {waitedFor(entry.joinedAt, now)}
        </p>
        {children}
      </div>
    </article>
  );
}

function WaitingEntryCard({
  entry,
  now,
  onNotify,
  onSeat,
}: {
  entry: QueueEntry;
  now: number;
  onNotify: () => void;
  onSeat: () => void;
}) {
  return (
    <PartyRow entry={entry} now={now}>
      <div className="mt-3 flex gap-2">
        <Button size="filter" variant="secondary" className="flex-1" onClick={onNotify}>
          Call party
        </Button>
        {/* A standard primary. The old board painted this emerald, which is a
            second brand colour and a success cue the system does not have. */}
        <Button size="filter" className="flex-1" onClick={onSeat}>
          Seat at table
        </Button>
      </div>
    </PartyRow>
  );
}

/**
 * A party that has been called and has not arrived yet.
 *
 * "Called · waiting for arrival" used to render in AMBER. It is the normal next
 * step of the workflow, not something to handle before the night ends — a
 * workflow position is never a severity. It is neutral.
 *
 * A FAILED message is the one attend case here, and it is real: the guest was
 * told nothing and does not know their table is ready. Delivery that succeeded
 * takes no colour at all — there is no green success pattern in this system.
 */
function CalledEntryCard({
  entry,
  now,
  onSeat,
  onRemove,
  onRetry,
}: {
  entry: QueueEntry;
  now: number;
  onSeat: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const failed = deliverySeverity(entry.delivery?.state) === "attend";

  return (
    <PartyRow entry={entry} now={now}>
      <p className="type-label mt-2 text-muted-foreground">
        Called · waiting for arrival
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {failed ? (
          <Badge tone="attend">Message failed</Badge>
        ) : (
          <span className="text-[13px] text-muted-foreground">
            {entry.delivery?.state === "delivered" &&
              `${entry.delivery.channel?.toUpperCase() ?? "Message"} delivered`}
            {entry.delivery?.state === "pending" && "Message sending"}
            {(!entry.delivery || entry.delivery.state === "unavailable") &&
              "No delivery channel set up"}
          </span>
        )}

        {failed ? (
          <span className="text-[13px] text-muted-foreground">
            The party is still called, but has not been told.
          </span>
        ) : null}

        {entry.delivery?.retryable ? (
          <Button size="filter" variant="ghost" onClick={onRetry}>
            Send again
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex gap-2">
        <Button size="filter" className="flex-1" onClick={onSeat}>
          Seated
        </Button>
        <Button size="filter" variant="secondary" className="flex-1" onClick={onRemove}>
          No-show
        </Button>
      </div>
    </PartyRow>
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
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 border-b border-border-strong pb-2">
        <h2 className="type-micro flex-1 text-muted-foreground">{title}</h2>
        {entries.length > 0 ? <Badge tone="neutral">{entries.length}</Badge> : null}
      </div>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-[length:var(--ui-size)] text-text-on-ink-faint">
          {emptyText}
        </p>
      ) : (
        entries.map((entry) => <div key={entry.id}>{children(entry)}</div>)
      )}
    </section>
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

  const { now } = useServiceClock();
  const { connected, lastContactAt } = useQueueSocket(businessId, (updated) => {
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
    <>
      {/* Critical. A queue board that has lost contact is showing a room that
          may already have moved on. */}
      <OfflineBar
        connected={connected}
        lastContactAt={lastContactAt}
        surface="This queue"
        onRetry={() => void refresh()}
      />

      <>
      <PageHeader
        wide
        title="Walk-in queue"
        description={`${waiting.length + called.length} active ${
          waiting.length + called.length === 1 ? "party" : "parties"
        }`}
        actions={
          <>
          {/* Icon alone below --bp-phone. The copied confirmation is the icon
              swap there — a tick where the copy glyph was — which is the same
              acknowledgement the label gives at wider widths. */}
          <Button
            variant="secondary"
            size="filter"
            className="min-w-[var(--control-desktop-min)]"
            aria-label={copied ? "Link copied" : "Copy queue link"}
            onClick={() => void handleCopy()}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            <span className="hidden phone:inline">
              {copied ? "Link copied" : "Copy queue link"}
            </span>
          </Button>
          </>
        }
      />

      <PageBody wide>
        {loadError ? (
          <div className="flex flex-wrap items-center gap-3 border-l-2 border-critical-fill bg-critical-tint px-4 py-3">
            <p className="flex-1 text-[length:var(--ui-size)] text-critical-text">
              {loadError}
            </p>
            <Button variant="secondary" size="filter" onClick={() => void refresh()}>
              Retry
            </Button>
          </div>
        ) : null}

        <section className="grid border border-border bg-card lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:border-r lg:border-b-0">
            <div>
              <p className="type-t2">This service day</p>
              <p className="mt-1 font-mono text-[12.5px] tabular-nums text-muted-foreground">
                {service?.serviceDate ?? "—"} · {service?.waitingCovers ?? 0} waiting
                covers
              </p>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="queue-cover-cap" className="mb-[7px]">
                  Waiting-cover cap
                </Label>
                <Input
                  id="queue-cover-cap"
                  type="number"
                  min={1}
                  max={1000}
                  value={coverCap}
                  onChange={(event) => setCoverCap(Number(event.target.value))}
                />
              </div>
              <Button
                size="md"
                variant="secondary"
                disabled={policySaving || coverCap < 1}
                onClick={() => void updatePolicy(service?.isOpen ? "closed" : "open")}
              >
                {service?.isOpen ? "Close queue" : "Open queue"}
              </Button>
            </div>

            {/* Neutral. Whether the queue is open, and how long the wait is
                running, are facts about the night — not things to act on now. */}
            <p className="text-[13px] text-muted-foreground">
              {service?.isOpen
                ? service.isFull
                  ? "Open, but at the cover cap."
                  : "Open to new walk-ins."
                : "Closed to new walk-ins. Parties already in the queue still work normally."}{" "}
              {service?.estimatedWaitMinutes !== undefined
                ? `Measured wait, from tonight's own turn times: ${service.estimatedWaitMinutes} min.`
                : "No measured wait yet tonight."}
            </p>
          </div>

          <div className="flex flex-col gap-3 p-4">
            <p className="type-t2">Add a walk-in</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_100px_1fr_auto]">
              <Input
                aria-label="Guest name"
                placeholder="Guest name"
                value={walkInName}
                onChange={(event) => setWalkInName(event.target.value)}
              />
              <Input
                aria-label="Party size"
                type="number"
                min={1}
                max={20}
                value={walkInPartySize}
                onChange={(event) => setWalkInPartySize(Number(event.target.value))}
              />
              <Input
                aria-label="Phone, optional"
                placeholder="Phone (optional)"
                value={walkInPhone}
                onChange={(event) => setWalkInPhone(event.target.value)}
              />
              <Button
                size="md"
                disabled={
                  walkInSaving ||
                  !service?.isOpen ||
                  service?.isFull ||
                  !walkInName.trim()
                }
                onClick={() => void addWalkIn()}
              >
                Add
              </Button>
            </div>
          </div>
        </section>

        {!loadError && waiting.length === 0 && called.length === 0 ? (
          <EmptyState
            title="Nobody waiting"
            description="Guests scan the code by the door and hold their place without an app. Parties appear here the moment they join, in the order they arrived."
            action={{ label: "Copy the queue link", onClick: () => void handleCopy() }}
          />
        ) : null}

        {/* Board */}
        {(waiting.length > 0 || called.length > 0) && (
          <div className="grid gap-6 sm:grid-cols-2">
            <QueueColumn title="Waiting" entries={waiting} emptyText="No parties waiting">
              {(entry) => (
                <WaitingEntryCard
                  entry={entry}
                  now={now}
                  onNotify={() => void handleNotify(entry)}
                  onSeat={() => void openSeating(entry)}
                />
              )}
            </QueueColumn>

            <QueueColumn title="Called" entries={called} emptyText="No parties called yet">
              {(entry) => (
                <CalledEntryCard
                  entry={entry}
                  now={now}
                  onSeat={() => void openSeating(entry)}
                  onRemove={() => handleRemove(entry)}
                  onRetry={() => void retryDelivery(entry)}
                />
              )}
            </QueueColumn>
          </div>
        )}

        {/* A real dialog, not a panel pinned to the bottom of the viewport.
            Removing a party is a decision that cannot be undone from here. */}
        <Dialog
          open={removeTarget !== null}
          onOpenChange={(open) => !open && setRemoveTarget(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Take {removeTarget?.name} off the queue?
              </DialogTitle>
              <DialogDescription>
                They lose their place, and the reason stays in the queue history
                against your name.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="remove-reason" className="mb-[7px]">
                  Reason
                </Label>
                <select
                  id="remove-reason"
                  className="h-10 w-full rounded-[var(--radius-3)] border border-input bg-input-background px-[13px] text-[length:var(--ui-size)] text-foreground"
                  value={removeReason}
                  onChange={(event) =>
                    setRemoveReason(event.target.value as typeof removeReason)
                  }
                >
                  <option value="guest_left">Guest left</option>
                  <option value="no_show">No-show</option>
                  <option value="staff_removed">Staff removed</option>
                </select>
              </div>

              <div>
                <Label htmlFor="remove-note" className="mb-[7px]">
                  Note
                </Label>
                <Input
                  id="remove-note"
                  placeholder="Optional"
                  value={removeNote}
                  onChange={(event) => setRemoveNote(event.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setRemoveTarget(null)}>Keep the party</Button>
              <Button
                variant="destructive-quiet"
                onClick={() => {
                  if (removeTarget) void confirmRemove(removeTarget);
                  setRemoveTarget(null);
                }}
              >
                Take them off
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
      </PageBody>
    </>
    </>
  );
}
