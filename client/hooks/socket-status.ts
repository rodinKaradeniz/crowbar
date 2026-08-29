/**
 * What every live-board socket hook reports.
 *
 * A live surface that loses its connection is one of the four exhaustive
 * CRITICAL cases in the severity rank — see `lib/severity.ts`. It gets the
 * persistent offline bar, never a toast, and the bar never dismisses itself.
 */
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
}
