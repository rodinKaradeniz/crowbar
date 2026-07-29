"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clientGetQueueEntries,
  clientGetFloorPlanBoard,
  clientNotifyQueueEntry,
  clientOpenFloorPlanSeating,
  clientRemoveQueueEntry,
} from "@/lib/client-api";
import { useQueueSocket } from "@/hooks/use-queue-socket";
import type { FloorPlanBoardTable, FloorPlanParty, QueueEntry } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
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
          Notify
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
}: {
  entry: QueueEntry;
  onSeat: () => void;
  onRemove: () => void;
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

      <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
        <Bell className="h-3 w-3 shrink-0" />
        <span>Notified · waiting for arrival</span>
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
  const [copied, setCopied] = useState(false);
  const [noShowTarget, setNoShowTarget] = useState<QueueEntry | null>(null);
  const [seatingTarget, setSeatingTarget] = useState<QueueEntry | null>(null);
  const [floorTables, setFloorTables] = useState<FloorPlanBoardTable[]>([]);
  const [seatingLoading, setSeatingLoading] = useState(false);

  const { connected } = useQueueSocket(businessId, (updated) => {
    setEntries(updated);
  });

  useEffect(() => {
    clientGetQueueEntries(businessId)
      .then(setEntries)
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Could not load queue."),
      );
  }, [businessId]);

  const waiting = entries.filter((e) => e.status === "waiting");
  const called = entries.filter((e) => e.status === "called");

  const handleNotify = async (entry: QueueEntry) => {
    setEntries((prev) =>
      prev.map((e) => e.id === entry.id ? { ...e, status: "called" as const } : e),
    );
    try {
      await clientNotifyQueueEntry(businessId, entry.id);
    } catch {
      setEntries((prev) =>
        prev.map((e) => e.id === entry.id ? { ...e, status: "waiting" as const } : e),
      );
      toast.error("Could not notify this party.");
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
    setNoShowTarget(entry);
  };

  const confirmRemove = async (entry: QueueEntry) => {
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      await clientRemoveQueueEntry(businessId, entry.id);
    } catch {
      setEntries((prev) => [...prev, entry]);
      toast.error("Could not remove this party.");
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

          <QueueColumn title="Notified" entries={called} emptyText="No parties notified yet">
            {(entry) => (
              <CalledEntryCard
                entry={entry}
                onSeat={() => void openSeating(entry)}
                onRemove={() => handleRemove(entry)}
              />
            )}
          </QueueColumn>
        </div>
      )}

      <ConfirmationDialog
        open={noShowTarget !== null}
        onOpenChange={(open) => !open && setNoShowTarget(null)}
        title="Mark as No-show"
        description={`This will remove ${noShowTarget?.name ?? "this party"}'s party of ${noShowTarget?.partySize ?? 1} from the queue.`}
        confirmLabel="Mark No-show"
        variant="destructive"
        onConfirm={() => {
          if (noShowTarget) void confirmRemove(noShowTarget);
          setNoShowTarget(null);
        }}
      />
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
