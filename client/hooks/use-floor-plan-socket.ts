"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * Receives only invalidations. The board's HTTP snapshot remains the sole
 * client state source, so a socket message always triggers a refetch.
 */
export function useFloorPlanSocket(
  businessId: string,
  onInvalidate: () => void,
): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(BASE_DELAY);
  const intentionalCloseRef = useRef(false);
  const onInvalidateRef = useRef(onInvalidate);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(async () => {
    const token = await fetchWebSocketToken();
    if (!token) return;
    if (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN) return;

    const socket = new WebSocket(
      `${getWsBase()}/ws/floor-plan/${businessId}`,
    );
    socketRef.current = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "authenticate", token }));
      setConnected(true);
      delayRef.current = BASE_DELAY;
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as { type?: string };
        if (message.type === "floor_plan_updated") onInvalidateRef.current();
      } catch {
        // Ignore malformed socket messages; the HTTP board remains available.
      }
    };
    socket.onclose = () => {
      setConnected(false);
      socketRef.current = null;
      if (intentionalCloseRef.current) return;
      const delay = delayRef.current;
      delayRef.current = Math.min(delay * 2, MAX_DELAY);
      retryRef.current = setTimeout(() => connectRef.current(), delay);
    };
    socket.onerror = () => socket.close();
  }, [businessId]);

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
      socketRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
