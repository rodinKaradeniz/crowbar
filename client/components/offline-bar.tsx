"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { LIVENESS_STALE_AFTER_MS } from "@/hooks/socket-status";

/**
 * The one alarm in the system.
 *
 * A live surface that has lost its connection is one of the four exhaustive
 * CRITICAL cases. It gets a persistent 38px band (`--offline-bar`) at the very
 * top of the viewport, in `--critical-fill`, with a 2s slow flash.
 *
 * **Never a toast. Never self-dismissing.** A board that quietly stops updating
 * is worse than no board — the whole point is that it cannot be missed and
 * cannot be waved away while the problem is still there.
 *
 * What it carries: the time since last contact, and a retry.
 *
 * What it does NOT carry, and why: the design also specifies a count of work
 * "held on this device". There is no offline outbox in this client — nothing is
 * queued locally when the socket drops — so claiming a held count would be a
 * lie about what is safe. Omitted rather than invented; recorded in
 * `docs/TODO.md`. The reassurance copy is trimmed to match what is actually
 * true.
 *
 * TWO WAYS A BOARD STOPS BEING LIVE, and only one of them closes the socket.
 * `connected: false` is the obvious one. The other is the Redis case: a failed
 * publish is logged and swallowed by design, so the event never enters the
 * stream, no frame is ever sent — AND THE SOCKET STAYS OPEN. `connected` stayed
 * true and this bar never appeared, while a second operator's board sat
 * unchanged with nothing on screen saying so. The server now sends a liveness
 * beat along the same path a real event travels, so silence past
 * LIVENESS_STALE_AFTER_MS means the path is broken. Same alarm, same tier: this
 * is not a new severity, it is the same "live board that has lost its
 * connection" the rank already names.
 */
export function OfflineBar({
  connected,
  lastContactAt,
  onRetry,
  surface,
}: {
  connected: boolean;
  /** Epoch ms of the last received frame; null if never connected. */
  lastContactAt: number | null;
  onRetry: () => void;
  /** What has stopped updating, in the operator's words — "This board". */
  surface: string;
}) {
  if (!connected) {
    return (
      <OfflineBanner
        lastContactAt={lastContactAt}
        onRetry={onRetry}
        surface={surface}
      />
    );
  }
  // Connected but silent for too long. `lastContactAt` is null only before the
  // first frame ever arrives, which the `connected` check above already covers.
  return (
    <StalenessWatch
      lastContactAt={lastContactAt}
      onRetry={onRetry}
      surface={surface}
    />
  );
}

/**
 * Watches an OPEN socket that has gone quiet.
 *
 * Separate from `OfflineBanner` so that the once-per-second clock only runs
 * where it is needed, and so the "connected" path costs one comparison per
 * second rather than a re-render of the board.
 */
function StalenessWatch({
  lastContactAt,
  onRetry,
  surface,
}: {
  lastContactAt: number | null;
  onRetry: () => void;
  surface: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (lastContactAt === null) return null;
  if (now - lastContactAt < LIVENESS_STALE_AFTER_MS) return null;

  return (
    <OfflineBanner
      lastContactAt={lastContactAt}
      onRetry={onRetry}
      surface={surface}
    />
  );
}

/**
 * Mounted only while offline, so the ticking clock starts on mount and stops on
 * unmount. Reading the clock in a lazy `useState` initialiser rather than
 * during render keeps the component pure, and this subtree never renders on the
 * server — it only appears after a connection is lost.
 */
function OfflineBanner({
  lastContactAt,
  onRetry,
  surface,
}: {
  lastContactAt: number | null;
  onRetry: () => void;
  surface: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = lastContactAt ? formatElapsed(now - lastContactAt) : null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="offline-alarm sticky top-0 z-50 flex h-[var(--offline-bar)] w-full items-center gap-[var(--space-12)] bg-critical-fill px-[var(--space-16)] text-critical-on-fill"
    >
      <span className="shrink-0 font-mono uppercase font-semibold text-[length:var(--label-size)] tracking-[var(--label-ls)]">
        {/* Colour is never the sole carrier of meaning — the word is here too.
            "No contact" rather than "offline": the bar now also covers an OPEN
            socket whose event path has died, where "offline" would be false.
            One phrase that is true in both cases beats two that each hold
            half the time. */}
        Not updating
        {elapsed ? ` · no contact ${elapsed}` : ""}
      </span>

      <span className="truncate text-[length:var(--ui-size)]">
        {surface} is not receiving new activity. Keep serving from what is on
        screen.
      </span>

      <Button
        variant="secondary"
        size="filter"
        onClick={onRetry}
        className="ml-auto shrink-0 border-critical-on-fill/40 text-critical-on-fill hover:border-critical-on-fill hover:bg-transparent"
      >
        Retry
      </Button>
    </div>
  );
}

/** mm:ss while short, then h:mm. 24-hour, no locale words — this is a duration. */
function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
