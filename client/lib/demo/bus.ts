"use client";

import { IS_DEMO } from "@/lib/demo/mode";

/**
 * How a demo board hears that something changed.
 *
 * A real deployment has a WebSocket for this; a frontend-only demo has no
 * server to push from, and the only changes that exist are the ones this
 * browser just made. So the browser tells itself: a channel for the visitor's
 * other tabs — the guest's phone view beside the host's board — and a plain
 * listener set for the tab that made the change.
 *
 * This is NOT a claim of liveness, and the demo does not make one. Nothing
 * arrives here that the visitor did not do.
 */

const CHANNEL = "crowbar-demo";

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (!IS_DEMO || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => {
      for (const listener of [...listeners]) listener();
    };
  }
  return channel;
}

/** Called after a write this browser made succeeded. */
export function publishDemoChange(): void {
  if (!IS_DEMO) return;
  ensureChannel()?.postMessage(1);
  for (const listener of [...listeners]) listener();
}

/** Returns the unsubscribe, in the shape an effect cleanup wants. */
export function subscribeDemoChange(listener: () => void): () => void {
  if (!IS_DEMO) return () => {};
  ensureChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
