"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientJoinQueue, clientGetQueueStatus, clientLeaveQueue } from "@/lib/client-api";
import type { Business, QueueStatus } from "@/types";
import { NightTheme } from "@/components/night-theme";

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
      <span className="figures w-8 text-center text-lg">{value}</span>
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
        <NightTheme />
        <div className="w-full max-w-sm space-y-8">
          {/* Business name */}
          <div className="text-center fade-rise">
            <p className="eyebrow text-brass">{business.name}</p>
          </div>

          {isCalled && (
            <div className="rounded-xl border border-primary/50 bg-card p-8 text-center glow-pulse fade-rise">
              <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" />
              <h2 className="font-display text-2xl text-primary">
                Your table is ready
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Please head to the host stand.
              </p>
            </div>
          )}

          {isDone && (
            <div className="rounded-xl border bg-card p-8 text-center fade-rise">
              {entry.status === "seated" ? (
                <>
                  <CheckCircle2 className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
                  <h2 className="font-display text-xl">Enjoy your visit</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You&apos;ve been seated at {business.name}.
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
                  <h2 className="font-display text-xl">Queue entry closed</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This queue entry is no longer active.
                  </p>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-5"
                onClick={() => void handleLeaveQueue()}
              >
                Join again
              </Button>
            </div>
          )}

          {!isCalled && !isDone && (
            <div className="text-center space-y-7 fade-rise" style={{ animationDelay: "80ms" }}>
              <div>
                <p className="text-sm text-muted-foreground">Hi, {entry.name} — you&apos;re</p>
                {/* The coaster: your place at the bar */}
                <div className="coaster mx-auto mt-5 h-40 w-40">
                  <p className="figures text-6xl text-primary">
                    {entry.position ?? "—"}
                  </p>
                </div>
                <p className="eyebrow mt-5">in the queue</p>
              </div>

              <div className="mx-auto max-w-60 space-y-2.5 text-left">
                <div className="flex items-baseline gap-2.5 text-sm">
                  <span className="text-muted-foreground">Party size</span>
                  <span className="leader-dots text-brass" aria-hidden />
                  <span className="figures">{entry.partySize}</span>
                </div>
                <div className="flex items-baseline gap-2.5 text-sm">
                  <span className="text-muted-foreground">Est. wait</span>
                  <span className="leader-dots text-brass" aria-hidden />
                  <span className="figures">{formatWait(estimatedWaitMinutes)}</span>
                </div>
                <div className="flex items-baseline gap-2.5 text-sm">
                  <span className="text-muted-foreground">Waiting</span>
                  <span className="leader-dots text-brass" aria-hidden />
                  <span className="figures">
                    {totalWaiting} {totalWaiting === 1 ? "party" : "parties"}
                  </span>
                </div>
              </div>

              <p className="figures text-xs text-muted-foreground">
                updates every 30s
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <NightTheme />
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center fade-rise">
          <p className="eyebrow text-brass mb-2">Walk-in queue</p>
          <h1 className="font-display text-3xl tracking-tight">{business.name}</h1>
          <div className="rule-double mt-5 mx-auto max-w-36" />
        </div>

        <form onSubmit={(e) => void handleJoin(e)} className="space-y-5 fade-rise" style={{ animationDelay: "100ms" }}>
          <div className="space-y-1.5">
            <Label htmlFor="queue-name" className="eyebrow">Your name *</Label>
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
            <Label className="eyebrow">Party size</Label>
            <PartyStepper value={partySize} onChange={setPartySize} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="queue-phone" className="eyebrow">
              Phone <span className="normal-case tracking-normal text-muted-foreground">(optional — for SMS when ready)</span>
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

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Joining…" : "Join queue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
