"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientJoinQueue, clientGetQueueStatus, clientLeaveQueue } from "@/lib/client-api";
import type { Business, QueueStatus } from "@/types";
import { cn } from "@/lib/utils";

const POLL_INTERVAL = 30_000;
const SESSION_KEY = (bizId: string) => `queue-session-${bizId}`;

interface StoredSession {
  sessionToken: string;
  businessId: string;
}

function getStoredSession(businessId: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY(businessId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(businessId: string, sessionToken: string) {
  localStorage.setItem(SESSION_KEY(businessId), JSON.stringify({ sessionToken, businessId }));
}

function clearSession(businessId: string) {
  localStorage.removeItem(SESSION_KEY(businessId));
}

function formatWait(minutes?: number): string {
  if (!minutes) return "A few minutes";
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.round(minutes / 60)}h ${minutes % 60}m`;
}

// ─── Party size stepper ───────────────────────────────────────────────────────

function PartyStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
      <span className="w-8 text-center text-lg font-semibold tabular-nums">{value}</span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => onChange(Math.min(20, value + 1))}
        disabled={value >= 20}
      >
        <ChevronUp className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function QueueJoinClient({ business }: { business: Business }) {
  const [step, setStep] = useState<"form" | "status">("form");
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const fetchStatus = useCallback(
    async (sessionToken: string) => {
      try {
        const s = await clientGetQueueStatus(business.id, sessionToken);
        setQueueStatus(s);
        if (s.entry.status === "seated" || s.entry.status === "removed") {
          stopPolling();
        }
      } catch {
        // silently ignore polling errors
      }
    },
    [business.id],
  );

  // Check for existing session on mount
  useEffect(() => {
    const stored = getStoredSession(business.id);
    if (!stored) return;
    setStep("status");
    fetchStatus(stored.sessionToken);
    pollRef.current = setInterval(() => fetchStatus(stored.sessionToken), POLL_INTERVAL);
    return stopPolling;
  }, [business.id, fetchStatus]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = await clientJoinQueue(business.id, {
        name: name.trim(),
        partySize,
        phone: phone.trim() || undefined,
      });
      saveSession(business.id, status.entry.sessionToken);
      setQueueStatus(status);
      setStep("status");
      pollRef.current = setInterval(
        () => fetchStatus(status.entry.sessionToken),
        POLL_INTERVAL,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the queue. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveQueue = async () => {
    const stored = getStoredSession(business.id);
    if (stored) {
      try {
        await clientLeaveQueue(business.id, stored.sessionToken);
      } catch {
        // ignore — clear session regardless
      }
    }
    clearSession(business.id);
    setQueueStatus(null);
    setName("");
    setPhone("");
    setPartySize(1);
    stopPolling();
    setStep("form");
  };

  // ─── Status view ─────────────────────────────────────────────────────────────

  if (step === "status" && queueStatus) {
    const { entry, totalWaiting, estimatedWaitMinutes } = queueStatus;
    const isCalled = entry.status === "called";
    const isDone = entry.status === "seated" || entry.status === "removed";

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Business name */}
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">{business.name}</p>
          </div>

          {isCalled && (
            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-6 text-center dark:bg-emerald-950">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
              <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                Your table is ready!
              </h2>
              <p className="mt-1 text-sm text-emerald-600 dark:text-emerald-400">
                Please head to the host stand.
              </p>
            </div>
          )}

          {isDone && (
            <div className="rounded-2xl border bg-card p-6 text-center">
              {entry.status === "seated" ? (
                <>
                  <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Enjoy your visit!</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You&apos;ve been seated at {business.name}.
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Queue entry closed</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This queue entry is no longer active.
                  </p>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => void handleLeaveQueue()}
              >
                Join again
              </Button>
            </div>
          )}

          {!isCalled && !isDone && (
            <div className="rounded-2xl border bg-card p-6 text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hi, {entry.name}</p>
                <p className="mt-3 text-5xl font-bold tabular-nums text-primary">
                  #{entry.position ?? "—"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">in the queue</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl bg-muted p-3 text-center">
                  <p className="text-xs text-muted-foreground">Party size</p>
                  <p className="text-lg font-semibold">{entry.partySize}</p>
                </div>
                <div className="rounded-xl bg-muted p-3 text-center">
                  <Clock className="mx-auto mb-0.5 h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Est. wait</p>
                  <p className="text-sm font-semibold">{formatWait(estimatedWaitMinutes)}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {totalWaiting} {totalWaiting === 1 ? "party" : "parties"} waiting · updates every 30s
              </p>
            </div>
          )}

          {!isDone && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => void handleLeaveQueue()}
            >
              Leave queue
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── Join form ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">{business.name}</h1>
          <p className="text-sm text-muted-foreground">Join the walk-in queue</p>
        </div>

        <form onSubmit={(e) => void handleJoin(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="queue-name">Your name *</Label>
            <Input
              id="queue-name"
              placeholder="e.g. Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="given-name"
              maxLength={255}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Party size</Label>
            <PartyStepper value={partySize} onChange={setPartySize} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="queue-phone">
              Phone <span className="text-muted-foreground">(optional — for SMS when ready)</span>
            </Label>
            <Input
              id="queue-phone"
              type="tel"
              placeholder="+1 555 000 0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Joining…" : "Join queue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
