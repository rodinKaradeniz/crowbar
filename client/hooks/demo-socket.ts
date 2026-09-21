"use client";

import { useEffect, useRef } from "react";

import type { SocketStatus } from "@/hooks/socket-status";
import { subscribeDemoChange } from "@/lib/demo/bus";

const DEMO_STATUS: SocketStatus = {
  connected: true,
  lastContactAt: null,
  reconnect: () => {},
};

/**
 * What a live-board socket hook is in the demo build: nothing to connect to.
 *
 * There is no WebSocket server behind a frontend-only demo, and a real hook
 * would retry forever and put the offline alarm on every board. This one opens
 * no socket and calls no endpoint. `connected` with no `lastContactAt` is the
 * state `OfflineBar` reads as "nothing to report", so the alarm stays exactly
 * as it is for real deployments — `offline-bar.tsx` and `socket-status.ts` are
 * untouched.
 *
 * It does carry one thing through: when the visitor changes something in
 * another tab of their own browser, the board is told to read again. That is
 * the whole of the demo's "live" — their own writes, never anyone else's.
 *
 * Each hook module chooses between this and its real body once, at module
 * load, on the build-time `IS_DEMO` flag — so the choice never changes between
 * renders, and real builds drop this branch.
 */
export function useDemoSocket(businessId: string, onInvalidate: () => void): SocketStatus {
  void businessId;
  const callbackRef = useRef(onInvalidate);
  useEffect(() => {
    callbackRef.current = onInvalidate;
  }, [onInvalidate]);
  useEffect(() => subscribeDemoChange(() => callbackRef.current()), []);
  return DEMO_STATUS;
}

/**
 * The same, for the two hooks whose callback wants the new list rather than a
 * nudge. The demo fetches it the way the page's own refresh would.
 */
export function useDemoDataSocket<T>(
  load: () => Promise<T>,
  onUpdate: (value: T) => void,
): SocketStatus {
  const loadRef = useRef(load);
  const updateRef = useRef(onUpdate);
  useEffect(() => {
    loadRef.current = load;
    updateRef.current = onUpdate;
  }, [load, onUpdate]);
  useEffect(
    () =>
      subscribeDemoChange(() => {
        void loadRef
          .current()
          .then((value) => updateRef.current(value))
          .catch(() => {
            // A demo read that fails has nothing to report and nothing to retry.
          });
      }),
    [],
  );
  return DEMO_STATUS;
}
