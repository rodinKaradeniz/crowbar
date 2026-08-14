"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Order } from "@/types";
import { toMoney } from "@/lib/money";

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
  const timeline = (o.status_timeline as Record<string, unknown>[]) ?? [];
  return {
    id: o.id as string,
    businessId: o.business_id as string,
    locationId: (o.location_id as string) || undefined,
    sessionToken: o.session_token as string,
    tableIdentifier: (o.table_identifier as string) || undefined,
    status: o.status as Order["status"],
    idempotencyKey: o.idempotency_key as string,
    currencyCode: o.currency_code as string,
    subtotalAmount: toMoney(o.subtotal_amount),
    taxAmount: toMoney(o.tax_amount),
    // Decimal fields coerced via the shared toMoney helper (mirrors toOrder in
    // client-api.ts) so callers can rely on the declared `number` type.
    totalAmount: toMoney(o.total_amount),
    notes: (o.notes as string) || undefined,
    placedAt: o.placed_at as string,
    lineItems: lineItems.map((li) => ({
      id: li.id as string,
      orderId: li.order_id as string,
      itemId: (li.item_id as string) || undefined,
      itemName: li.item_name as string,
      quantity: Number(li.quantity),
      unitPrice: toMoney(li.unit_price),
      currencyCode: li.currency_code as string,
      taxProfileId: (li.tax_profile_id as string) || undefined,
      taxProfileVersionId: (li.tax_profile_version_id as string) || undefined,
      taxProfileName: li.tax_profile_name as string,
      taxProfileCode: li.tax_profile_code as string,
      taxRate: toMoney(li.tax_rate),
      priceIncludesTax: li.price_includes_tax as boolean,
      subtotalAmount: toMoney(li.subtotal_amount),
      taxAmount: toMoney(li.tax_amount),
      totalAmount: toMoney(li.total_amount),
      selectedModifiers: ((li.selected_modifiers as Record<string, unknown>[]) ?? []).map((s) => ({
        modifierId: s.modifier_id as string,
        name: s.name as string,
        priceDelta: toMoney(s.price_delta),
      })),
      routingTag: li.routing_tag as string,
      isAlcoholic: (li.is_alcoholic as boolean) ?? false,
      notes: (li.notes as string) || undefined,
    })),
    statusTimeline: timeline.map((t) => ({
      id: t.id as string,
      fromStatus: (t.from_status as string) || undefined,
      status: t.status as string,
      changedBy: (t.changed_by as string) || undefined,
      changedAt: t.changed_at as string,
    })),
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
  // Holds the latest `connect` so the reconnect timer can re-invoke it without
  // referencing `connect` inside its own useCallback (self-reference-before-
  // declaration). Both refs are synced in effects below, never during render.
  const connectRef = useRef<() => void>(() => {});

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

  return { connected };
}
