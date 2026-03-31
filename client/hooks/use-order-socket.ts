"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Order } from "@/types";

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

function toOrderFromWS(o: Record<string, unknown>): Order {
  const lineItems = (o.line_items as Record<string, unknown>[]) ?? [];
  return {
    id: o.id as string,
    businessId: o.business_id as string,
    locationId: (o.location_id as string) || undefined,
    sessionToken: o.session_token as string,
    tableIdentifier: (o.table_identifier as string) || undefined,
    status: o.status as Order["status"],
    idempotencyKey: o.idempotency_key as string,
    totalAmount: o.total_amount as number,
    notes: (o.notes as string) || undefined,
    placedAt: o.placed_at as string,
    lineItems: lineItems.map((li) => ({
      id: li.id as string,
      orderId: li.order_id as string,
      itemId: (li.item_id as string) || undefined,
      itemName: li.item_name as string,
      quantity: li.quantity as number,
      unitPrice: li.unit_price as number,
      selectedModifiers: ((li.selected_modifiers as Record<string, unknown>[]) ?? []).map((s) => ({
        modifierId: s.modifier_id as string,
        name: s.name as string,
        priceDelta: s.price_delta as number,
      })),
      routingTag: li.routing_tag as string,
      notes: (li.notes as string) || undefined,
    })),
    statusTimeline: [],
  };
}

const BASE_DELAY = 1000;
const MAX_DELAY = 30_000;

export function useOrderSocket(
  businessId: string,
  onUpdate: (orders: Order[]) => void,
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

    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const url = `${getWsBase()}/ws/orders/${businessId}?token=${encodeURIComponent(jwt)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      delayRef.current = BASE_DELAY;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "order_updated" && Array.isArray(msg.orders)) {
          onUpdateRef.current(
            (msg.orders as Record<string, unknown>[]).map(toOrderFromWS),
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
