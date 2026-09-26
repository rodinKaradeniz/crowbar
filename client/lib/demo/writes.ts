import { hasCapability, type Capability } from "@/lib/permissions";

import type { DemoOp } from "./ops";
import { wouldOverflow } from "./ops";
import {
  DEMO_BUSINESS_ID,
  MENU_ITEMS,
  RECORDED_TABS,
  TABLE_BY_QR_TOKEN,
  TABLES,
} from "./snapshot";
import { reduceOps, type DemoState } from "./state";
import type { DemoRole } from "./token";

/**
 * What a visitor may change, and what happens when they do.
 *
 * The demo keeps the service loop and nothing else: book, plan onto a table,
 * seat, scan and order, add a staff round, move the rounds to the pass,
 * record that the register settled the tab, close the seating, call a waiting
 * party. Those writes become ops in the visitor's own cookie. EVERY OTHER
 * WRITE IS REFUSED IN WORDS — a demo that half-saved a venue setting would be
 * worse than one that saves nothing.
 *
 * Role still decides. The capability each route carries here is the one the
 * backend's own router carries, so entering as bar/kitchen and trying to seat
 * a party is refused in the demo exactly as it would be for real.
 */

export const DEMO_NOT_SAVED = {
  code: "DEMO_NOT_SAVED",
  message: "Not saved. This part of Crowbar is not in the demo.",
  details: null,
};

export const DEMO_STATE_FULL = {
  code: "DEMO_STATE_FULL",
  message:
    "This demo evening is as full as one browser can hold. Start the evening " +
    "again to keep going.",
  details: null,
};

const FORBIDDEN = {
  code: "FORBIDDEN",
  message: "Your role does not include this.",
  details: null,
};

const UNAUTHENTICATED = {
  code: "UNAUTHORIZED",
  message: "Not authenticated",
  details: null,
};

const NOT_FOUND = {
  code: "NOT_FOUND",
  message: "Not found",
  details: null,
};

function invalid(message: string) {
  return { code: "VALIDATION_ERROR", message, details: null };
}

export interface DemoWriteRequest {
  method: string;
  /** Backend path, starting `/api/`. */
  path: string;
  body: unknown;
  role: DemoRole | null;
  nowMs: number;
  ops: readonly DemoOp[];
}

export interface DemoWriteResult {
  status: number;
  body?: unknown;
  /**
   * Answer by reading this path instead, so a write's reply is the same truth
   * the page would get on its next refresh — including the date shift the
   * recording needs.
   */
  reread?: { path: string; pickId?: string };
  /** The log to keep, when this write changed it. */
  ops?: DemoOp[];
}

type Body = Record<string, unknown>;

function asBody(value: unknown): Body {
  return typeof value === "object" && value !== null ? (value as Body) : {};
}

function stringField(body: Body, key: string): string | null {
  const value = body[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tableIdsField(body: Body): string[] {
  const value = body.table_ids;
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && TABLES.has(id));
}

/** `[menu item id, quantity]` per line, dropping anything not on the menu. */
function itemsField(body: Body): [string, number][] {
  const value = body.items;
  if (!Array.isArray(value)) return [];
  const lines: [string, number][] = [];
  for (const entry of value) {
    const line = asBody(entry);
    const itemId = stringField(line, "item_id");
    const quantity = Number(line.quantity ?? 0);
    if (itemId && MENU_ITEMS.has(itemId) && quantity > 0) {
      lines.push([itemId, Math.floor(quantity)]);
    }
  }
  return lines;
}

export function handleDemoWrite(request: DemoWriteRequest): DemoWriteResult {
  const { path, role, nowMs } = request;
  const method = request.method.toUpperCase();
  const body = asBody(request.body);
  const business = DEMO_BUSINESS_ID;

  /** Staff gate: the capability the backend's own route requires. */
  const gate = (capability: Capability): DemoWriteResult | null => {
    if (!role) return { status: 401, body: UNAUTHENTICATED };
    if (!hasCapability(role, capability)) return { status: 403, body: FORBIDDEN };
    return null;
  };

  const commit = (
    op: DemoOp,
    respond: (state: DemoState, index: number) => Omit<DemoWriteResult, "ops">,
  ): DemoWriteResult => {
    if (wouldOverflow(request.ops, op)) return { status: 409, body: DEMO_STATE_FULL };
    const ops = [...request.ops, op];
    return { ...respond(reduceOps(ops), ops.length - 1), ops };
  };

  const state = reduceOps(request.ops);

  // ── Book ──────────────────────────────────────────────────────────────────
  const booking =
    (method === "POST" && path === "/api/reservations/public") ||
    (method === "POST" && path === "/api/reservations");
  if (booking) {
    const staff = path === "/api/reservations";
    if (staff) {
      const refusal = gate("reservations.manage");
      if (refusal) return refusal;
    }
    const serviceTypeId = stringField(body, "service_type_id");
    const time = stringField(body, "time");
    const name = stringField(body, "name");
    if (!serviceTypeId || !time || !name) {
      return { status: 422, body: invalid("A booking needs a name, a service and a time.") };
    }
    const op: DemoOp = {
      t: "book",
      s: serviceTypeId,
      w: time,
      g: Math.max(1, Number(body.guests ?? 1)),
      n: name,
      p: stringField(body, "phone") ?? "",
      e: stringField(body, "email") ?? "",
      at: nowMs,
      ...(staff && role ? { u: role } : {}),
    };
    return commit(op, (next) => ({
      status: 201,
      body: next.reservations[next.reservations.length - 1],
    }));
  }

  // ── Plan a party onto tables ──────────────────────────────────────────────
  const tables = /^\/api\/floor-plan\/(reservations|queue)\/([^/]+)\/tables$/.exec(path);
  if (tables && (method === "PUT" || method === "DELETE")) {
    const refusal = gate("floor.operate");
    if (refusal) return refusal;
    const kind = tables[1] === "queue" ? "queue" : "reservation";
    const op: DemoOp =
      method === "DELETE"
        ? { t: "unassign", k: kind, i: tables[2], at: nowMs, ...(role ? { u: role } : {}) }
        : {
            t: "assign",
            k: kind,
            i: tables[2],
            tb: tableIdsField(body),
            at: nowMs,
            ...(role ? { u: role } : {}),
          };
    if (op.t === "assign" && op.tb.length === 0) {
      return { status: 422, body: invalid("Choose at least one table on the board.") };
    }
    return commit(op, () => ({ status: 204 }));
  }

  // ── Seat ──────────────────────────────────────────────────────────────────
  if (method === "POST" && path === "/api/floor-plan/seatings") {
    const refusal = gate("floor.operate");
    if (refusal) return refusal;
    const sourceId = stringField(body, "source_id");
    const chosen = tableIdsField(body);
    if (!sourceId || chosen.length === 0) {
      return { status: 422, body: invalid("Choose a party and at least one table.") };
    }
    const op: DemoOp = {
      t: "seat",
      k: body.source_type === "queue" ? "queue" : "reservation",
      i: sourceId,
      tb: chosen,
      at: nowMs,
      ...(role ? { u: role } : {}),
    };
    return commit(op, (next) => ({
      status: 201,
      body: next.seatings[next.seatings.length - 1],
    }));
  }

  const closing = /^\/api\/floor-plan\/seatings\/([^/]+)\/close$/.exec(path);
  if (closing && method === "POST") {
    const refusal = gate("floor.operate");
    if (refusal) return refusal;
    const seatingId = closing[1];
    const tab =
      state.tabBySeating.get(seatingId) ??
      state.tabs.find((candidate) => candidate.seating_id === seatingId);
    if (tab && tab.status === "open" && tab.orders.length > 0) {
      // The backend's own rule: an open tab with rounds on it holds the table.
      return {
        status: 409,
        body: {
          code: "TAB_STILL_OPEN",
          message: "Settle the tab before closing the seating.",
          details: null,
        },
      };
    }
    const op: DemoOp = { t: "close", sg: seatingId, at: nowMs, ...(role ? { u: role } : {}) };
    return commit(op, () => ({ status: 204 }));
  }

  // ── Scan the table QR, and the decision that answers it ───────────────────
  if (method === "POST" && path === `/api/ordering/${business}/table-sessions`) {
    const token = stringField(body, "table_token");
    const tableId = token ? TABLE_BY_QR_TOKEN.get(token) : undefined;
    if (!tableId) {
      // The demo holds no signing key and wants none: it recognises the codes
      // the recorded QR sheet carries and opens nothing for any other string.
      return { status: 404, body: NOT_FOUND };
    }
    const open = state.session;
    if (open && open.table_id === tableId && open.status !== "denied") {
      // This browser already has a session at this table and staff may have
      // approved it. Hand that one back rather than logging a second scan:
      // the reducer would keep the first anyway, and the log stays shorter.
      return {
        status: 201,
        body: {
          status: open.status,
          table_label: open.table_label,
          expires_at: open.expires_at,
        },
      };
    }
    const op: DemoOp = { t: "scan", tb: tableId, at: nowMs };
    return commit(op, (next) => ({
      status: 201,
      body: next.session
        ? {
            status: next.session.status,
            table_label: next.session.table_label,
            expires_at: next.session.expires_at,
          }
        : null,
    }));
  }

  const decision = /^\/api\/floor-plan\/table-guest-sessions\/([^/]+)\/(approve|deny)$/.exec(path);
  if (decision && method === "POST") {
    const refusal = gate("floor.operate");
    if (refusal) return refusal;
    if (!state.session || state.session.id !== decision[1]) {
      return { status: 404, body: NOT_FOUND };
    }
    const op: DemoOp = {
      t: "decide",
      sn: decision[1],
      ok: decision[2] === "approve",
      at: nowMs,
      ...(role ? { u: role } : {}),
    };
    return commit(op, () => ({ status: 204 }));
  }

  // ── Rounds ────────────────────────────────────────────────────────────────
  if (method === "POST" && path === `/api/ordering/${business}/orders`) {
    const session = state.session;
    if (!session || session.status !== "approved") {
      return {
        status: 403,
        body: {
          code: "FORBIDDEN",
          message: "This table's ordering session has not been approved.",
          details: null,
        },
      };
    }
    const lines = itemsField(body);
    if (lines.length === 0) return { status: 422, body: invalid("The cart is empty.") };
    const op: DemoOp = { t: "order", b: null, tb: session.table_id, c: "qr", it: lines, at: nowMs };
    return commit(op, (next) => ({
      status: 201,
      body: next.orders[next.orders.length - 1],
    }));
  }

  const tabOrder = /^\/api\/tabs\/([^/]+)\/orders$/.exec(path);
  if (tabOrder && method === "POST") {
    const refusal = gate("tabs.operate");
    if (refusal) return refusal;
    // The tab is the visitor's own, or one the recorded evening opened. Either
    // way the round goes onto it; `state.ts` keeps rounds against a recorded
    // tab in a side map and `project.ts` merges them back.
    const own = state.tabsById.get(tabOrder[1]);
    const recorded = own ? undefined : RECORDED_TABS.get(tabOrder[1]);
    if (!own && !recorded) return { status: 404, body: NOT_FOUND };
    const lines = itemsField(body);
    if (lines.length === 0) return { status: 422, body: invalid("The round is empty.") };
    const op: DemoOp = {
      t: "order",
      b: tabOrder[1],
      tb: own?.table_id ?? recorded?.table_id ?? null,
      c: "staff",
      it: lines,
      at: nowMs,
      ...(role ? { u: role } : {}),
    };
    return commit(op, (next) => ({
      status: 201,
      body: next.orders[next.orders.length - 1],
    }));
  }

  const seatingTab = /^\/api\/tabs\/seatings\/([^/]+)$/.exec(path);
  if (seatingTab && method === "POST") {
    const refusal = gate("tabs.operate");
    if (refusal) return refusal;
    const existing = state.tabBySeating.get(seatingTab[1]);
    if (existing) return { status: 200, body: existing };
    const op: DemoOp = { t: "tab", sg: seatingTab[1], at: nowMs, ...(role ? { u: role } : {}) };
    return commit(op, (next) => ({
      status: 201,
      body: next.tabBySeating.get(seatingTab[1]) ?? null,
    }));
  }

  const lineStatus =
    /^\/api\/ordering\/[^/]+\/orders\/([^/]+)\/lines\/([^/]+)\/status$/.exec(path);
  if (lineStatus && method === "PATCH") {
    const refusal = gate("orders.fulfill");
    if (refusal) return refusal;
    const wanted = stringField(body, "status");
    if (wanted !== "received" && wanted !== "preparing" && wanted !== "ready" && wanted !== "served") {
      return { status: 422, body: invalid("That is not a ticket state.") };
    }
    const op: DemoOp = {
      t: "line",
      l: lineStatus[2],
      st: wanted,
      at: nowMs,
      ...(role ? { u: role } : {}),
    };
    return commit(op, (next) => {
      const own = next.orders.find((order) => order.id === lineStatus[1]);
      if (own) return { status: 200, body: own };
      return {
        status: 200,
        reread: { path: `/api/ordering/${business}/orders`, pickId: lineStatus[1] },
      };
    });
  }

  // ── Settle, as the register already did ───────────────────────────────────
  const settle = /^\/api\/tabs\/([^/]+)\/settle-externally$/.exec(path);
  if (settle && method === "POST") {
    const refusal = gate("tabs.settle");
    if (refusal) return refusal;
    const op: DemoOp = {
      t: "settle",
      b: settle[1],
      m: stringField(body, "informational_method"),
      nt: stringField(body, "note"),
      r: stringField(body, "external_register_reference"),
      at: nowMs,
      ...(role ? { u: role } : {}),
    };
    return commit(op, (next) => {
      const own = next.tabsById.get(settle[1]);
      if (own) return { status: 200, body: own };
      return { status: 200, reread: { path: "/api/tabs", pickId: settle[1] } };
    });
  }

  // ── Call a waiting party ──────────────────────────────────────────────────
  const call = /^\/api\/queue\/entries\/([^/]+)\/call$/.exec(path);
  if (call && method === "POST") {
    const refusal = gate("queue.manage");
    if (refusal) return refusal;
    const op: DemoOp = { t: "call", q: call[1], at: nowMs, ...(role ? { u: role } : {}) };
    return commit(op, () => ({
      status: 200,
      reread: { path: "/api/queue/entries", pickId: call[1] },
    }));
  }

  return { status: 409, body: DEMO_NOT_SAVED };
}
