"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueEntry } from "@/types";

function toQueueEntryFromWS(e: Record<string, unknown>): QueueEntry {
  return {
    id: e.id as string,
    businessId: e.business_id as string,
    sessionToken: e.session_token as string,
    name: e.name as string,
    partySize: e.party_size as number,
    phone: (e.phone as string) || undefined,
    status: e.status as QueueEntry["status"],
    position: (e.position as number) ?? undefined,
    joinedAt: e.joined_at as string,
    calledAt: (e.called_at as string) || undefined,
    seatedAt: (e.seated_at as string) || undefined,
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
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(BASE_DELAY);
  const intentionalClose = useRef(false);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const connect = useCallback(async () => {
    const jwt = await fetchJwt();
    if (!jwt) return;

    // Guard: don't open a second socket if one is already open/connecting
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const url = `${getWsBase()}/ws/queue/${businessId}?token=${encodeURIComponent(jwt)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      delayRef.current = BASE_DELAY;
    };

    ws.onmessage = (event) => {
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
      retryRef.current = setTimeout(() => void connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [businessId]);

  useEffect(() => {
    intentionalClose.current = false;
    void connect();
    return () => {
      intentionalClose.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
