/**
 * What every live-board socket hook reports.
 *
 * A live surface that loses its connection is one of the four exhaustive
 * CRITICAL cases in the severity rank — see `lib/severity.ts`. It gets the
 * persistent offline bar, never a toast, and the bar never dismisses itself.
 */
/**
 * How long a board may hear nothing before it stops calling itself live.
 *
 * MUST stay above `HEARTBEAT_INTERVAL_SECONDS` in `server/app/core/heartbeat.py`
 * — three of those beats. The server sends one every 15s along the same path a
 * real event travels, so three missed beats means the event path is broken, not
 * that the venue is quiet. The two constants live in different languages and
 * cannot import one another: change one, change the other.
 *
 * This is what makes a Redis outage visible. `publish()` swallows a failed
 * write by design, so the socket stayed open and `connected` stayed true while
 * nothing could ever arrive again. Time since last contact is the only evidence
 * a client has, and it already had it.
 */
export const LIVENESS_STALE_AFTER_MS = 45_000;

export interface SocketStatus {
  /** False the moment the socket closes, before any reconnect attempt lands. */
  connected: boolean;
  /**
   * Epoch ms of the last frame this device received, including the
   * authenticated open. Null until the first successful connection.
   *
   * This is genuinely "time since last contact". What it is NOT is a count of
   * work held on the device: there is no offline outbox in this client, so the
   * offline bar shows the duration and omits the held count rather than
   * inventing one. Recorded in `docs/TODO.md`.
   */
  lastContactAt: number | null;
  /**
   * Reconnect NOW, cancelling any pending backoff and resetting it.
   *
   * This exists because the offline bar's Retry did not reconnect anything:
   * all four consumers wired `onRetry` to an HTTP refetch, so pressing Retry
   * under a live offline bar left the socket exactly as dead as it was. It is
   * declared here, in the one place the shape is written down, so the four
   * hooks cannot disagree about whether they offer it.
   *
   * Safe to call at any time: a connect already in flight is left alone.
   */
  reconnect: () => void;
}
