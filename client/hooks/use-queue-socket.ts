"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SocketStatus } from "@/hooks/socket-status";
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

export function useQueueSocket(
  businessId: string,
  onUpdate: (entries: QueueEntry[]) => void,
): SocketStatus {
  const [connected, setConnected] = useState(false);
  const [lastContactAt, setLastContactAt] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(BASE_DELAY);
  const intentionalClose = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  // Holds the latest `connect` so the reconnect timer can re-invoke it without
  // referencing `connect` inside its own useCallback (self-reference-before-
  // declaration). Both refs are synced in effects below, never during render.
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(async () => {
    const jwt = await fetchJwt();
    if (!jwt) return;

    // Guard: don't open a second socket if one is already open/connecting
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const url = `${getWsBase()}/ws/queue/${businessId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setLastContactAt(Date.now());
      ws.send(JSON.stringify({ type: "authenticate", token: jwt }));
      setConnected(true);
      delayRef.current = BASE_DELAY;
    };

    ws.onmessage = (event) => {
      setLastContactAt(Date.now());
      try {
        const msg = JSON.parse(event.data as string);
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
      wsRef.current = null;
      if (intentionalClose.current) return;

      const delay = delayRef.current;
      delayRef.current = Math.min(delay * 2, MAX_DELAY);
      retryRef.current = setTimeout(() => connectRef.current(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [businessId]);

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
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, lastContactAt };
}
