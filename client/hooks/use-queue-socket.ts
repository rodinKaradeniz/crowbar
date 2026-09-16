"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDemoSocket } from "@/hooks/demo-socket";
import type { SocketStatus } from "@/hooks/socket-status";
import { IS_DEMO } from "@/lib/demo/mode";
import type { QueueEntry } from "@/types";

function toQueueEntryFromWS(e: Record<string, unknown>): QueueEntry {
  const delivery = e.delivery as Record<string, unknown> | null | undefined;
  return {
    id: e.id as string,
    businessId: e.business_id as string,
    name: e.name as string,
    partySize: e.party_size as number,
    phone: (e.phone as string) || undefined,
    status: e.status as QueueEntry["status"],
    position: (e.position as number) ?? undefined,
    joinedAt: e.joined_at as string,
    calledAt: (e.called_at as string) || undefined,
    seatedAt: (e.seated_at as string) || undefined,
    completedAt: (e.completed_at as string) || undefined,
    removedAt: (e.removed_at as string) || undefined,
    serviceDate: e.service_date as string,
    terminalReasonCode: (e.terminal_reason_code as string) || undefined,
    terminalReasonNote: (e.terminal_reason_note as string) || undefined,
    delivery: delivery ? {
      state: delivery.state as string,
      channel: (delivery.channel as string) || undefined,
      retryable: (delivery.retryable as boolean) ?? false,
      attemptCount: Number(delivery.attempt_count ?? 0),
      lastError: (delivery.last_error as string) || undefined,
    } : undefined,
  };
}

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

async function fetchJwt(): Promise<string | null> {
  try {
    const res = await fetch("/api/ws-token");
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

const BASE_DELAY = 1000;
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

function useLiveQueueSocket(
  businessId: string,
  onUpdate: (entries: QueueEntry[]) => void,
): SocketStatus {
  const [connected, setConnected] = useState(false);
  const [lastContactAt, setLastContactAt] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(BASE_DELAY);
  const stableRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalClose = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  // Holds the latest `connect` so the reconnect timer can re-invoke it without
  // referencing `connect` inside its own useCallback (self-reference-before-
  // declaration). Both refs are synced in effects below, never during render.
  const connectRef = useRef<() => void>(() => {});

  /**
   * The backoff, in one place, so the token-fetch path and `onclose` cannot
   * drift apart. They did: `onclose` had a correct 1s→30s chain and a failed
   * token fetch simply returned, scheduling nothing — and `/api/ws-token` is
   * exactly what fails while the backend is down. One `return` ended the retry
   * chain permanently and only a full page reload brought the board back.
   */
  const scheduleRetry = useCallback(() => {
    if (intentionalClose.current) return;
    if (retryRef.current) clearTimeout(retryRef.current);
    const delay = delayRef.current;
    delayRef.current = Math.min(delay * 2, MAX_DELAY);
    retryRef.current = setTimeout(() => connectRef.current(), delay);
  }, []);

  const connect = useCallback(async () => {
    if (intentionalClose.current) return;
    const jwt = await fetchJwt();
    if (intentionalClose.current) return;
    if (!jwt) {
      // The backend is down, or the session is gone. Either way this is the
      // failure the board most needs to recover from, so it schedules the same
      // backoff `onclose` would have.
      scheduleRetry();
      return;
    }

    // Guard: don't open a second socket if one is already open/connecting
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const url = `${getWsBase()}/ws/queue/${businessId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

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
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "authenticate", token: jwt }));
    };

    ws.onmessage = (event) => {
      setLastContactAt(Date.now());
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "authenticated") {
          setConnected(true);
          if (stableRef.current) clearTimeout(stableRef.current);
          stableRef.current = setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) delayRef.current = BASE_DELAY;
          }, STABLE_AFTER_MS);
          return;
        }
        if (msg.type === "queue_updated" && Array.isArray(msg.entries)) {
          onUpdateRef.current(
            (msg.entries as Record<string, unknown>[]).map(toQueueEntryFromWS),
          );
        }
      } catch {
        // malformed message — ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (stableRef.current) {
        clearTimeout(stableRef.current);
        stableRef.current = null;
      }
      wsRef.current = null;
      scheduleRetry();
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [businessId, scheduleRetry]);
  /** Retry, now. See `SocketStatus.reconnect`. */
  const reconnect = useCallback(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    delayRef.current = BASE_DELAY;
    intentionalClose.current = false;
    const socket = wsRef.current;
    if (socket && socket.readyState <= WebSocket.OPEN) return;
    wsRef.current = null;
    void connectRef.current();
  }, []);


  // Keep the refs pointed at the latest values (synced in effects, not during
  // render). onUpdateRef is read in ws.onmessage; connectRef in the reconnect timer.
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    intentionalClose.current = false;
    void connect();
    return () => {
      intentionalClose.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (stableRef.current) clearTimeout(stableRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, lastContactAt, reconnect };
}

/** The demo build has no socket server; see `hooks/demo-socket.ts`. */
export const useQueueSocket: typeof useLiveQueueSocket = IS_DEMO
  ? useDemoSocket
  : useLiveQueueSocket;
