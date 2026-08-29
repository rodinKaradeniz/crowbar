"use client";

import { useEffect, useState } from "react";

import { useMounted } from "@/hooks/use-mounted";

/**
 * A ticking clock for surfaces that measure elapsed service time — how late a
 * booking is, how long a tab has been open, what time it is at the venue.
 *
 * Two things it gets right that a bare `Date.now()` in render does not:
 *
 * · It is read in a lazy initialiser, so the component stays pure. Calling the
 *   clock during render makes every render a different render.
 * · `ready` is false until after hydration. The server and the browser will
 *   never agree on the current time, so anything derived from it — a "12 Min
 *   late" badge, a wall clock — must not be rendered until the client owns it.
 *
 * Default cadence is 30s: minute-resolution copy does not need a per-second
 * re-render of a whole board. Pass 1000 where seconds are actually shown.
 */
export function useServiceClock(intervalMs = 30_000): {
  now: number;
  ready: boolean;
} {
  const ready = useMounted();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return { now, ready };
}
