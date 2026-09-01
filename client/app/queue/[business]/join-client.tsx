"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientGetPublicQueueService, clientJoinQueue, clientGetQueueStatus, clientLeaveQueue, ClientApiError } from "@/lib/client-api";
import type { Business, QueueServiceDay, QueueStatus } from "@/types";

const POLL_INTERVAL = 30_000;

/**
 * Why the service read failed, because the two answers are not the same
 * promise to a guest. A 4xx here describes how the venue is configured —
 * `QUEUE_LOCATION_REQUIRED` (409) when it has no primary location — and no
 * amount of retrying changes it, so the page must not offer a button that
 * cannot work. A network failure, a 5xx, or a 429 from the public read limit
 * is a moment in time, and retrying is exactly right.
 */
type ServiceFault = "retryable" | "unavailable";

function classifyServiceFault(err: unknown): ServiceFault {
  if (err instanceof ClientApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
    return "unavailable";
  }
  return "retryable";
}
function formatWait(minutes?: number): string {
  if (minutes === undefined) return "Not enough history yet";
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
        variant="secondary"
        size="icon"
        className="shrink-0"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
      <span className="w-8 text-center font-mono tabular-nums text-[length:var(--t1-size)]">{value}</span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="shrink-0"
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
  const [service, setService] = useState<QueueServiceDay | null>(null);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [serviceError, setServiceError] = useState<ServiceFault | null>(null);
  const [stale, setStale] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const joinKeyRef = useRef<string | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const fetchStatus = useCallback(
    async () => {
      try {
        const s = await clientGetQueueStatus(business.id);
        setQueueStatus(s);
        setStep("status");
        setStale(false);
        if (s.entry.status === "seated" || s.entry.status === "removed") {
          stopPolling();
        }
      } catch {
        setStale(true);
      }
    },
    [business.id],
  );

  const refreshService = useCallback(async () => {
    try {
      setService(await clientGetPublicQueueService(business.id));
      setServiceError(null);
    } catch (err) {
      setServiceError(classifyServiceFault(err));
    } finally {
      setServiceLoading(false);
    }
  }, [business.id]);

  useEffect(() => {
    void refreshService();
    const id = setInterval(() => void refreshService(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refreshService]);

  // The queue capability lives only in an HttpOnly cookie. A missing cookie is
  // indistinguishable from an expired or unknown queue entry.
  useEffect(() => {
    void fetchStatus();
    pollRef.current = setInterval(() => void fetchStatus(), POLL_INTERVAL);
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
    joinKeyRef.current ??= crypto.randomUUID();
    try {
      const status = await clientJoinQueue(business.id, {
        name: name.trim(),
        partySize,
        phone: phone.trim() || undefined,
        idempotencyKey: joinKeyRef.current,
      });
      setQueueStatus(status);
      setStep("status");
      joinKeyRef.current = null;
      pollRef.current = setInterval(
        () => void fetchStatus(),
        POLL_INTERVAL,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the queue. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveQueue = async () => {
    try {
      await clientLeaveQueue(business.id);
    } catch {
      // The local status is cleared even if the capability has already expired.
    }
    setQueueStatus(null);
    setName("");
    setPhone("");
    setPartySize(1);
    joinKeyRef.current = null;
    stopPolling();
    setStep("form");
  };

  // ─── Status view ─────────────────────────────────────────────────────────────

  if (step === "status" && queueStatus) {
    const { entry, estimatedWaitMinutes } = queueStatus;
    const isCalled = entry.status === "called";
    const isDone = entry.status === "seated" || entry.status === "removed";

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Business name */}
          <div className="text-center enter-rise">
            <p className="type-label text-muted-foreground">{business.name}</p>
          </div>

          {isCalled && (
            <div className="border border-primary/50 bg-card p-8 text-center live-pulse enter-rise">
              <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-primary" />
              <h2 className="type-t1 text-primary">
                Your table is ready
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Please head to the host stand.
              </p>
            </div>
          )}

          {isDone && (
            <div className="border bg-card p-8 text-center enter-rise">
              {entry.status === "seated" ? (
                <>
                  <CheckCircle2 className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
                  <h2 className="type-t1">Enjoy your visit</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You&apos;ve been seated at {business.name}.
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
                  <h2 className="type-t1">Queue entry closed</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    This queue entry is no longer active.
                  </p>
                </>
              )}
              <Button
                variant="secondary"
                size="filter"
                className="mt-5"
                onClick={() => void handleLeaveQueue()}
              >
                Join again
              </Button>
            </div>
          )}

          {!isCalled && !isDone && (
            <div className="text-center space-y-7 enter-rise" style={{ animationDelay: "80ms" }}>
              <div>
                <p className="text-sm text-muted-foreground">Hi, {entry.name} — you&apos;re</p>
                {/* The coaster: your place at the bar */}
                <div className="flex items-center justify-center rounded-full border border-border-strong mx-auto mt-5 h-40 w-40">
                  <p className="font-mono tabular-nums text-[length:var(--d2-size)] text-primary">
                    {entry.position ?? "—"}
                  </p>
                </div>
                <p className="type-label text-muted-foreground mt-5">in the queue</p>
              </div>

              <div className="mx-auto max-w-60 space-y-2.5 text-left">
                <div className="flex items-baseline gap-2.5 text-sm">
                  <span className="text-muted-foreground">Party size</span>
                  <span className="flex-1" aria-hidden />
                  <span className="font-mono tabular-nums">{entry.partySize}</span>
                </div>
                <div className="flex items-baseline gap-2.5 text-sm">
                  <span className="text-muted-foreground">Est. wait</span>
                  <span className="flex-1" aria-hidden />
                  <span className="font-mono tabular-nums">{formatWait(estimatedWaitMinutes)}</span>
                </div>
              </div>

              <p className="font-mono tabular-nums text-xs text-muted-foreground">
                updates every 30s
              </p>
            </div>
          )}

          {!isDone && (
            <Button
              variant="ghost"
              size="filter"
              className="w-full text-muted-foreground"
              onClick={() => void handleLeaveQueue()}
            >
              Leave queue
            </Button>
          )}
          {stale && (
            <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground" role="status">
              <AlertCircle className="h-3.5 w-3.5" /> Updates are delayed. We&apos;ll keep retrying.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (serviceLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-sm text-muted-foreground">Checking today&apos;s queue…</p></div>;
  }

  // A venue that cannot hold queue entries at all. Same shape as the closed and
  // full states below, because it is the same kind of answer — a fact about the
  // venue, not a failure the guest can clear — and deliberately no button.
  if (serviceError === "unavailable") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm space-y-4 text-center">
          <p className="type-label text-muted-foreground">{business.name}</p>
          <h1 className="type-d3">Walk-ins aren&apos;t available here</h1>
          <p className="text-sm text-muted-foreground">
            This venue isn&apos;t taking walk-in queue entries through this page. Please speak to a member of staff.
          </p>
        </div>
      </div>
    );
  }

  if (serviceError === "retryable") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm space-y-4 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="type-t1">Queue status unavailable</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t confirm whether the queue is open. Please try again.</p>
          <Button onClick={() => void refreshService()}>Try again</Button>
        </div>
      </div>
    );
  }

  if (!service?.isOpen || service.isFull) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm space-y-4 text-center">
          <p className="type-label text-muted-foreground">{business.name}</p>
          <h1 className="type-d3">{service?.isFull ? "The queue is full" : "The queue is closed"}</h1>
          <p className="text-sm text-muted-foreground">
            {service?.isFull ? "The waiting-cover limit has been reached. Please check again later." : "Walk-in queue entries are not being accepted for this service day."}
          </p>
          <Button variant="secondary" onClick={() => void refreshService()}>Check again</Button>
        </div>
      </div>
    );
  }

  // ─── Join form ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center enter-rise">
          <p className="type-label text-muted-foreground mb-2">Walk-in queue</p>
          <h1 className="type-d3">{business.name}</h1>
          <div className="border-t border-border mt-5 mx-auto max-w-36" />
          <p className="mt-4 text-sm text-muted-foreground">
            {service.estimatedWaitMinutes === undefined
              ? "The queue is open. A wait estimate will appear once enough recent seating history is available."
              : `Current measured wait: ${formatWait(service.estimatedWaitMinutes)}`}
          </p>
        </div>

        <form onSubmit={(e) => void handleJoin(e)} className="space-y-5 enter-rise" style={{ animationDelay: "100ms" }}>
          <div className="space-y-1.5">
            <Label htmlFor="queue-name" className="type-label text-muted-foreground">Your name *</Label>
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
            <Label className="type-label text-muted-foreground">Party size</Label>
            <PartyStepper value={partySize} onChange={setPartySize} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="queue-phone" className="type-label text-muted-foreground">
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

          <Button type="submit" className="w-full" size="md" disabled={loading}>
            {loading ? "Joining…" : "Join queue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
