"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardCheck, Plus } from "lucide-react";

import {
  clientCancelCountSession,
  clientCreateCountSession,
  clientGetCountSessions,
} from "@/lib/client-api";
import type { CountSessionSummary } from "@/types";
import { formatBusinessDateTime } from "@/lib/business-time";
import { useRegionalSettings } from "@/contexts/regional-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";

interface Props {
  businessId: string;
  businessTimezone: string;
  canManage: boolean;
}

export function CountsPanel({ businessId, businessTimezone, canManage }: Props) {
  const router = useRouter();
  const { locale } = useRegionalSettings();
  const [sessions, setSessions] = useState<CountSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [toCancel, setToCancel] = useState<CountSessionSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await clientGetCountSessions(businessId));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load counts");
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function startCount(kind: "stocktake" | "cycle_count") {
    setStarting(true);
    try {
      const session = await clientCreateCountSession(businessId, { kind });
      toast.success("Count opened");
      // Straight to the stockroom screen -- that is where the work happens.
      router.push(`/business/inventory/counts/${session.id}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not open a count");
    } finally {
      setStarting(false);
    }
  }

  async function cancel() {
    if (!toCancel) return;
    try {
      await clientCancelCountSession(businessId, toCancel.id);
      toast.success("Count cancelled");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not cancel the count");
    } finally {
      setToCancel(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-t2">Counts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stocktakes and cycle counts. Reconciling posts the variance to the stock ledger.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2 shrink-0">
            <Button
              variant="secondary"
              onClick={() => startCount("cycle_count")}
              disabled={starting}
            >
              Cycle Count
            </Button>
            <Button onClick={() => startCount("stocktake")} disabled={starting}>
              <Plus className="h-4 w-4 mr-1.5" />
              Start Stocktake
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="border-l-2 border-critical-fill bg-critical-tint px-4 py-3 text-[length:var(--ui-size)] text-critical-text">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading counts…</div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No counts yet"
          description="Open a stocktake to compare what is on the shelf against the ledger."
          action={
            canManage ? { label: "Start Stocktake", onClick: () => startCount("stocktake") } : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium">
                  {session.kind === "stocktake" ? "Stocktake" : "Cycle count"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Opened {formatBusinessDateTime(session.createdAt, businessTimezone, locale)}
                  {session.reconciledAt &&
                    ` · Reconciled ${formatBusinessDateTime(session.reconciledAt, businessTimezone, locale)}`}
                </div>
              </div>
              <Badge
                tone="neutral"
                /* A count in progress is a workflow position, not a severity. */
                className="text-muted-foreground"
              >
                {session.status === "open"
                  ? "Open"
                  : session.status === "reconciled"
                    ? "Reconciled"
                    : "Cancelled"}
              </Badge>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="filter"
                  variant={session.status === "open" ? "primary" : "secondary"}
                  onClick={() => router.push(`/business/inventory/counts/${session.id}`)}
                >
                  {session.status === "open" ? "Continue" : "View"}
                </Button>
                {canManage && session.status === "open" && (
                  <Button size="filter" variant="ghost" onClick={() => setToCancel(session)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmationDialog
        open={toCancel !== null}
        onOpenChange={(open) => !open && setToCancel(null)}
        title="Cancel this count?"
        description="Counted font-mono tabular-nums are discarded and no stock movement is posted."
        confirmLabel="Cancel Count"
        variant="destructive"
        onConfirm={cancel}
      />
    </div>
  );
}
