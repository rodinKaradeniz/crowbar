"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDemoSocket } from "@/hooks/demo-socket";
import type { SocketStatus } from "@/hooks/socket-status";
import { IS_DEMO } from "@/lib/demo/mode";

function wsBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  if (typeof window !== "undefined") return window.location.origin.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  return "ws://localhost:8000";
}

async function fetchToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/ws-token");
    if (!response.ok) return null;
    return ((await response.json()) as { token?: string }).token ?? null;
  } catch { return null; }
}

// Named, and the same numbers as the other three hooks, which all declare them.
// This one carried a bare 1000 in two places and a bare 30_000 in a third.
const BASE_DELAY = 1_000;
const MAX_DELAY = 30_000;

/**
 * How long a socket must stay up before its backoff is allowed to reset.
 *
 * "A frame arrived" is not enough on its own: the queue socket's own failure
 * authenticated successfully every time and then died ~30ms later, so any
 * frame-based reset held the retry at 1s forever. Comfortably longer than the
 * failures observed (25–135ms to close) and shorter than the server's 15s
 * liveness beat, so a genuinely healthy socket always clears it.
 */
const STABLE_AFTER_MS = 5_000;

function useLiveTabSocket(businessId: string, onInvalidate: () => void): SocketStatus {
  const [connected, setConnected] = useState(false);
  const [lastContactAt, setLastContactAt] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(BASE_DELAY);
  const stableRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);
  const callbackRef = useRef(onInvalidate);
  const connectRef = useRef<() => void>(() => {});

  /**
   * The backoff, in one place, so the token-fetch path and `onclose` cannot
   * drift apart. They did: `onclose` had a correct 1s→30s chain and a failed
   * token fetch simply returned, scheduling nothing — and `/api/ws-token` is
   * exactly what fails while the backend is down. One `return` ended the
   * retry chain permanently and only a full page reload brought the board back.
   */
  const scheduleRetry = useCallback(() => {
    if (stoppedRef.current) return;
    if (retryRef.current) clearTimeout(retryRef.current);
    const delay = delayRef.current;
    delayRef.current = Math.min(delay * 2, MAX_DELAY);
    retryRef.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  const connect = useCallback(async () => {
    if (stoppedRef.current) return;
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;
    const token = await fetchToken();
    if (stoppedRef.current) return;
    if (!token) {
      scheduleRetry();
      return;
    }
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;
    const socket = new WebSocket(`${wsBase()}/ws/tabs/${businessId}`);
    socketRef.current = socket;
    /**
     * OPENING IS NOT SUCCESS. The server accepts the socket first and validates
     * the authenticate frame after (server/app/services/websocket_auth.py), so
     * a rejected token — expired session_version, revoked staff row, disabled
     * module, wrong business — produces open → close, and the queue router has
     * a second such path that closes cleanly when the tenant has no location.
     *
     * Resetting the backoff here treated that as a working connection, so an
     * accept-then-close loop retried at the base delay forever and never backed
     * off; `setConnected(true)` made the offline bar mount and unmount with it,
     * which is the flicker. `lastContactAt` waits too: a handshake is not
     * contact, and refreshing it here held the "no contact" counter at 00:00.
     *
     * NOR IS THE `authenticated` FRAME SUCCESS, which the reproduction settled:
     * the queue socket authenticated on every attempt and still died ~30ms
     * later with 1006, so resetting on that frame kept the retry pinned at the
     * base delay just as `onopen` had. The backoff resets only once the
     * connection has STAYED up past STABLE_AFTER_MS — the only signal that
     * distinguishes a connection that worked from one that merely started.
     */
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "authenticate", token }));
    };
    socket.onmessage = (event) => {
      setLastContactAt(Date.now());
      // This hook used to invalidate on ANY frame. The liveness beat is a frame
      // that deliberately means nothing changed, so refetching on it would put
      // a tabs request on the wire every 15 seconds forever. The other three
      // hooks already match on their own message type; this one now does too.
      try {
        const message = JSON.parse(event.data as string) as { type?: string };
        if (message.type === "authenticated") {
          setConnected(true);
          if (stableRef.current) clearTimeout(stableRef.current);
          stableRef.current = setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) delayRef.current = BASE_DELAY;
          }, STABLE_AFTER_MS);
          // Refetch on every SUCCESSFUL connection. It moved off `onopen` with
          // the backoff reset: under an accept-then-close loop it was a refetch
          // storm on the wire once a second on top of the socket storm.
          callbackRef.current();
          return;
        }
        if (message.type === "heartbeat") return;
      } catch {
        // Malformed frame. Treat it as contact and refetch, as before.
      }
      callbackRef.current();
    };
    socket.onclose = () => {
      setConnected(false);
      if (stableRef.current) {
        clearTimeout(stableRef.current);
        stableRef.current = null;
      }
      socketRef.current = null;
      scheduleRetry();
    };
    socket.onerror = () => socket.close();
  }, [businessId, scheduleRetry]);

  /** Retry, now. See `SocketStatus.reconnect`. */
  const reconnect = useCallback(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    delayRef.current = BASE_DELAY;
    stoppedRef.current = false;
    const socket = socketRef.current;
    if (socket && socket.readyState <= WebSocket.OPEN) return;
    socketRef.current = null;
    void connectRef.current();
  }, []);

  useEffect(() => { callbackRef.current = onInvalidate; }, [onInvalidate]);
  useEffect(() => { connectRef.current = () => void connect(); }, [connect]);
  useEffect(() => {
    stoppedRef.current = false;
    void connect();
    return () => {
      stoppedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (stableRef.current) clearTimeout(stableRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  return { connected, lastContactAt, reconnect };
}

/** The demo build has no socket server; see `hooks/demo-socket.ts`. */
export const useTabSocket: typeof useLiveTabSocket = IS_DEMO
  ? useDemoSocket
  : useLiveTabSocket;
