"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDemoSocket } from "@/hooks/demo-socket";
import type { SocketStatus } from "@/hooks/socket-status";
import { IS_DEMO } from "@/lib/demo/mode";

function getWsBase(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  }
  if (typeof window !== "undefined") {
    return window.location.origin
      .replace(/^http:\/\//, "ws://")
      .replace(/^https:\/\//, "wss://");
  }
  return "ws://localhost:8000";
}

async function fetchWebSocketToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/ws-token");
    if (!response.ok) return null;
    const body = await response.json() as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

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

/**
 * Receives only invalidations. The board's HTTP snapshot remains the sole
 * client state source, so a socket message always triggers a refetch.
 */
function useLiveFloorPlanSocket(
  businessId: string,
  onInvalidate: () => void,
): SocketStatus {
  const [connected, setConnected] = useState(false);
  const [lastContactAt, setLastContactAt] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(BASE_DELAY);
  const stableRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const onInvalidateRef = useRef(onInvalidate);
  const connectRef = useRef<() => void>(() => {});

  /**
   * The backoff, in one place, so the token-fetch path and `onclose` cannot
   * drift apart. They did: `onclose` had a correct 1s→30s chain and a failed
   * token fetch simply returned, scheduling nothing — and `/api/ws-token` is
   * exactly what fails while the backend is down. One `return` ended the retry
   * chain permanently and only a full page reload brought the board back.
   */
  const scheduleRetry = useCallback(() => {
    if (intentionalCloseRef.current) return;
    if (retryRef.current) clearTimeout(retryRef.current);
    const delay = delayRef.current;
    delayRef.current = Math.min(delay * 2, MAX_DELAY);
    retryRef.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  const connect = useCallback(async () => {
    if (intentionalCloseRef.current) return;
    const token = await fetchWebSocketToken();
    if (intentionalCloseRef.current) return;
    if (!token) {
      // The backend is down, or the session is gone. Either way this is the
      // failure the board most needs to recover from, so it schedules the same
      // backoff `onclose` would have.
      scheduleRetry();
      return;
    }
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

    const socket = new WebSocket(
      `${getWsBase()}/ws/floor-plan/${businessId}`,
    );
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
      try {
        const message = JSON.parse(event.data as string) as { type?: string };
        if (message.type === "authenticated") {
          setConnected(true);
          if (stableRef.current) clearTimeout(stableRef.current);
          stableRef.current = setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) delayRef.current = BASE_DELAY;
          }, STABLE_AFTER_MS);
          // Refetch on every SUCCESSFUL connection, not just the first. This
          // socket carries INVALIDATIONS, not state, so an event that fired
          // while the board was away is simply gone — reconnecting without
          // re-reading leaves the host looking at a floor that stopped being
          // true during the outage. It moved off `onopen` with the backoff
          // reset: under an accept-then-close loop it was a refetch storm on
          // the wire once a second on top of the socket storm.
          onInvalidateRef.current();
          return;
        }
        if (message.type === "floor_plan_updated") onInvalidateRef.current();
      } catch {
        // Ignore malformed socket messages; the HTTP board remains available.
      }
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
    intentionalCloseRef.current = false;
    const socket = socketRef.current;
    if (socket && socket.readyState <= WebSocket.OPEN) return;
    socketRef.current = null;
    void connectRef.current();
  }, []);


  useEffect(() => {
    onInvalidateRef.current = onInvalidate;
  }, [onInvalidate]);
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);
  useEffect(() => {
    intentionalCloseRef.current = false;
    void connect();
    return () => {
      intentionalCloseRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (stableRef.current) clearTimeout(stableRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  return { connected, lastContactAt, reconnect };
}

/** The demo build has no socket server; see `hooks/demo-socket.ts`. */
export const useFloorPlanSocket: typeof useLiveFloorPlanSocket = IS_DEMO
  ? useDemoSocket
  : useLiveFloorPlanSocket;
