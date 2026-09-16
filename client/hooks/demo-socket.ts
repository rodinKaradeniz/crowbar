import type { SocketStatus } from "@/hooks/socket-status";

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
 * untouched. The demo is read-only, so the board has nothing to miss; the demo
 * indicator tells the visitor boards do not update live.
 *
 * Each hook module chooses between this and its real body once, at module
 * load, on the build-time `IS_DEMO` flag — so the choice never changes between
 * renders, and real builds drop this branch.
 */
export function useDemoSocket(...args: unknown[]): SocketStatus {
  void args;
  return DEMO_STATUS;
}
