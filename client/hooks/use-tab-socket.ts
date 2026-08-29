"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SocketStatus } from "@/hooks/socket-status";

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

export function useTabSocket(businessId: string, onInvalidate: () => void): SocketStatus {
  const [connected, setConnected] = useState(false);
  const [lastContactAt, setLastContactAt] = useState<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(1000);
  const stoppedRef = useRef(false);
  const callbackRef = useRef(onInvalidate);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(async () => {
    const token = await fetchToken();
    if (!token || stoppedRef.current || (socketRef.current && socketRef.current.readyState <= WebSocket.OPEN)) return;
    const socket = new WebSocket(`${wsBase()}/ws/tabs/${businessId}`);
    socketRef.current = socket;
    socket.onopen = () => {
      setLastContactAt(Date.now());
      socket.send(JSON.stringify({ type: "authenticate", token }));
      setConnected(true);
      delayRef.current = 1000;
      callbackRef.current();
    };
    socket.onmessage = () => {
      setLastContactAt(Date.now());
      callbackRef.current();
    };
    socket.onclose = () => {
      setConnected(false);
      socketRef.current = null;
      if (stoppedRef.current) return;
      const delay = delayRef.current;
      delayRef.current = Math.min(delay * 2, 30_000);
      retryRef.current = setTimeout(() => connectRef.current(), delay);
    };
    socket.onerror = () => socket.close();
  }, [businessId]);

  useEffect(() => { callbackRef.current = onInvalidate; }, [onInvalidate]);
  useEffect(() => { connectRef.current = () => void connect(); }, [connect]);
  useEffect(() => {
    stoppedRef.current = false;
    void connect();
    return () => {
      stoppedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  return { connected, lastContactAt };
}
