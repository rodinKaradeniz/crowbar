import { demoId } from "./ids";
import type { DemoOp, OrderOp } from "./ops";
import {
  DEMO_BUSINESS_ID,
  DEMO_CURRENCY,
  DEMO_LOCATION_ID,
  MENU_ITEMS,
  RECORDED_CUSTOMERS,
  RECORDED_LINES,
  RECORDED_OPEN_TAB_BY_TABLE,
  RECORDED_QUEUE_ENTRIES,
  RECORDED_RESERVATIONS,
  RECORDED_TABS,
  TABLES,
} from "./snapshot";
import { DEMO_ROLES, type DemoRole } from "./token";

/**
 * The visitor's evening: the recorded snapshot plus what they did to it.
 *
 * Pure. The op log goes in, a set of indexes comes out, and `project.ts`
 * renders those indexes into the bodies the pages read. Nothing here touches a
 * cookie, a request or the clock beyond the timestamps the ops carry, so the
 * whole write layer is testable as a function.
 *
 * It models the service loop and only the service loop. Anything outside it is
 * refused at the door in `writes.ts` rather than half-modelled here.
 */

export type LineStatus = "received" | "preparing" | "ready" | "served";

const STATUS_RANK: Record<LineStatus, number> = {
  received: 0,
  preparing: 1,
  ready: 2,
  served: 3,
};

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function iso(at: number): string {
  return new Date(at).toISOString();
}

function actorId(role: DemoRole | undefined): string | null {
  return role ? DEMO_ROLES[role].userId : null;
}

export interface PartySource {
  source_type: "reservation" | "queue";
  source_id: string;
  name: string;
  party_size: number;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  assigned_table_ids: string[];
  customer_id: string | null;
  guest_context: {
    customer_id: string;
    tags: unknown[];
    dietary_details: null;
    preferences: null;
  } | null;
}

export interface DemoSeating {
  id: string;
  source: PartySource;
  table_ids: string[];
  opened_at: string;
  closed_at: string | null;
  open_tab_id: string | null;
}

export interface DemoOrderLine {
  id: string;
  order_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  currency_code: string;
  tax_profile_id: string | null;
  tax_profile_version_id: string | null;
  tax_profile_name: string | null;
  tax_profile_code: string | null;
  tax_rate: number;
  price_includes_tax: boolean;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  selected_modifiers: unknown[];
  routing_tag: string | null;
  preparation_station_id: string | null;
  preparation_station_name: string | null;
  routes_to_all_stations: boolean;
  line_status: LineStatus;
  is_alcoholic: boolean;
  notes: string | null;
}

export interface DemoOrder {
  id: string;
  business_id: string;
  location_id: string | null;
  table_id: string | null;
  tab_id: string | null;
  table_identifier: string | null;
  status: LineStatus;
  idempotency_key: string;
  currency_code: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  placed_at: string;
  cancelled_by: null;
  cancelled_at: null;
  cancellation_reason: null;
  line_items: DemoOrderLine[];
  status_timeline: {
    id: string;
    from_status: string | null;
    status: string;
    changed_by: string | null;
    changed_at: string;
  }[];
}

export interface DemoSettlement {
  id: string;
  event_type: "settled_externally";
  actor_id: string | null;
  occurred_at: string;
  currency_code: string;
  total_snapshot: number;
  informational_method: string | null;
  note: string | null;
  external_register_reference: string | null;
  related_settlement_event_id: null;
}

export interface DemoTab {
  id: string;
  business_id: string;
  table_id: string | null;
  seating_id: string;
  customer_id: string | null;
  status: "open" | "settled_externally";
  channel: "qr" | "staff";
  opened_by: string | null;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  settled_method: string | null;
  current_settlement_event_id: string | null;
  settlement_events: DemoSettlement[];
  total: number;
  orders: DemoOrder[];
}

export interface DemoTableSession {
  id: string;
  business_id: string;
  table_id: string;
  table_label: string;
  seating_id: string | null;
  status: "pending" | "approved" | "denied";
  opened_at: string;
  expires_at: string;
}

export interface DemoState {
  /** Ops that were replayed, in order. */
  ops: readonly DemoOp[];
  /** Reservations the visitor booked, newest last, in the API's own shape. */
  reservations: Record<string, unknown>[];
  /** Guests those bookings created. */
  customers: Record<string, unknown>[];
  /** `${sourceType}:${sourceId}` → the tables planned for it. Empty means unassigned. */
  assignments: Map<string, string[]>;
  seatings: DemoSeating[];
  /** `${sourceType}:${sourceId}` → the open seating for that party. */
  seatingBySource: Map<string, DemoSeating>;
  tabs: DemoTab[];
  tabsById: Map<string, DemoTab>;
  tabBySeating: Map<string, DemoTab>;
  /** Orders the visitor placed, including the ones sitting on a tab. */
  orders: DemoOrder[];
  /** Every line the visitor moved, recorded or new, by line id. */
  lineStatus: Map<string, LineStatus>;
  /** Settlement recorded against a recorded tab, by tab id. */
  recordedTabSettlements: Map<string, DemoSettlement>;
  /** Rounds the visitor added to a recorded tab, by tab id. */
  recordedTabOrders: Map<string, DemoOrder[]>;
  /** Recorded seatings the visitor closed. */
  closedRecordedSeatings: Set<string>;
  /** Recorded queue parties the visitor called, by entry id → called at. */
  calledQueue: Map<string, string>;
  /** Queue parties the visitor seated, by entry id → seated at. */
  seatedQueue: Map<string, string>;
  /** The QR ordering session this browser has open, if any. */
  session: DemoTableSession | null;
  /** Servings of a menu item that reached the pass this evening, by item id. */
  servedDelta: Map<string, number>;
}

const SESSION_MINUTES = 90;

function emptyState(ops: readonly DemoOp[]): DemoState {
  return {
    ops,
    reservations: [],
    customers: [],
    assignments: new Map(),
    seatings: [],
    seatingBySource: new Map(),
    tabs: [],
    tabsById: new Map(),
    tabBySeating: new Map(),
    orders: [],
    lineStatus: new Map(),
    recordedTabSettlements: new Map(),
    recordedTabOrders: new Map(),
    closedRecordedSeatings: new Set(),
    calledQueue: new Map(),
    seatedQueue: new Map(),
    session: null,
    servedDelta: new Map(),
  };
}

/** The party behind a source id, from the recording or from this evening. */
export function partyFor(
  state: DemoState,
  kind: "reservation" | "queue",
  id: string,
  tableIds: string[],
): PartySource | null {
  if (kind === "queue") {
    const entry = RECORDED_QUEUE_ENTRIES.find((candidate) => candidate.id === id);
    if (!entry) return null;
    return {
      source_type: "queue",
      source_id: id,
      name: entry.name,
      party_size: entry.party_size,
      status: state.calledQueue.has(id) ? "called" : entry.status,
      starts_at: null,
      ends_at: null,
      assigned_table_ids: tableIds,
      customer_id: null,
      guest_context: null,
    };
  }

  const booked = state.reservations.find((candidate) => candidate.id === id);
  const recorded = RECORDED_RESERVATIONS.find((candidate) => candidate.id === id);
  const reservation = (booked ?? recorded) as Record<string, unknown> | undefined;
  if (!reservation) return null;
  const customerId = (reservation.customer_id as string | null) ?? null;
  const mine = state.customers.find((candidate) => candidate.id === customerId);
  const name =
    (mine?.name as string | undefined) ??
    (customerId ? RECORDED_CUSTOMERS.get(customerId)?.name : undefined) ??
    "Guest";
  return {
    source_type: "reservation",
    source_id: id,
    name,
    party_size: Number(reservation.guests ?? 0),
    status: String(reservation.status ?? "confirmed"),
    starts_at: (reservation.time as string | null) ?? null,
    ends_at: (reservation.ends_at as string | null) ?? null,
    assigned_table_ids: tableIds,
    customer_id: customerId,
    guest_context: customerId
      ? { customer_id: customerId, tags: [], dietary_details: null, preferences: null }
      : null,
  };
}

function buildOrder(
  op: OrderOp,
  index: number,
  tabId: string | null,
  tableId: string | null,
): DemoOrder {
  const orderId = demoId("order", index);
  const lines: DemoOrderLine[] = [];
  op.it.forEach(([itemId, quantity], position) => {
    const item = MENU_ITEMS.get(itemId);
    if (!item) return;
    const total = round2(item.price * quantity);
    const subtotal = item.priceIncludesTax
      ? round2(total / (1 + item.taxRate / 100))
      : total;
    lines.push({
      id: demoId("line", index, position),
      order_id: orderId,
      item_id: itemId,
      item_name: item.name,
      quantity,
      unit_price: item.price,
      currency_code: DEMO_CURRENCY,
      tax_profile_id: item.taxProfileId,
      tax_profile_version_id: item.taxProfileVersionId,
      tax_profile_name: item.taxProfileName,
      tax_profile_code: item.taxProfileCode,
      tax_rate: item.taxRate,
      price_includes_tax: item.priceIncludesTax,
      subtotal_amount: subtotal,
      tax_amount: round2(total - subtotal),
      total_amount: total,
      selected_modifiers: [],
      routing_tag: item.routingTag ?? (item.isAlcoholic ? "bar" : "kitchen"),
      preparation_station_id: item.preparationStationId,
      preparation_station_name: item.preparationStationName,
      routes_to_all_stations: false,
      line_status: "received",
      is_alcoholic: item.isAlcoholic,
      notes: null,
    });
  });

  const table = tableId ? TABLES.get(tableId) : undefined;
  return {
    id: orderId,
    business_id: DEMO_BUSINESS_ID,
    location_id: DEMO_LOCATION_ID,
    table_id: tableId,
    tab_id: tabId,
    table_identifier: table?.label ?? null,
    status: "received",
    idempotency_key: `demo-${index}`,
    currency_code: DEMO_CURRENCY,
    subtotal_amount: round2(lines.reduce((sum, line) => sum + line.subtotal_amount, 0)),
    tax_amount: round2(lines.reduce((sum, line) => sum + line.tax_amount, 0)),
    total_amount: round2(lines.reduce((sum, line) => sum + line.total_amount, 0)),
    notes: null,
    placed_at: iso(op.at),
    cancelled_by: null,
    cancelled_at: null,
    cancellation_reason: null,
    line_items: lines,
    status_timeline: [
      {
        id: demoId("timeline", index, 0),
        from_status: null,
        status: "received",
        changed_by: actorId(op.u),
        changed_at: iso(op.at),
      },
    ],
  };
}

/** An order is wherever its least advanced line is. */
export function orderStatusFrom(statuses: readonly LineStatus[]): LineStatus {
  if (statuses.length === 0) return "received";
  return statuses.reduce((lowest, status) =>
    STATUS_RANK[status] < STATUS_RANK[lowest] ? status : lowest,
  );
}

function tabTotal(tab: DemoTab): number {
  return round2(tab.orders.reduce((sum, order) => sum + order.total_amount, 0));
}

/**
 * What a tab is carrying now, wherever it came from.
 *
 * A recorded tab has no object here to hold a running total, so its recorded
 * one is added to rather than recomputed: the recording's figure is the API's
 * own answer and may legitimately exclude something the orders list still
 * shows.
 */
function totalFor(state: DemoState, tabId: string): number {
  const own = state.tabsById.get(tabId);
  if (own) return own.total;
  const recorded = RECORDED_TABS.get(tabId);
  if (!recorded) return 0;
  const added = state.recordedTabOrders.get(tabId) ?? [];
  return round2(
    Number(recorded.total ?? 0) + added.reduce((sum, order) => sum + order.total_amount, 0),
  );
}

/** Replay the log. The result is what every read is rendered against. */
export function reduceOps(ops: readonly DemoOp[]): DemoState {
  const state = emptyState(ops);

  ops.forEach((op, index) => {
    switch (op.t) {
      case "book": {
        const customerId = demoId("customer", index);
        const reservationId = demoId("reservation", index);
        state.customers.push({
          id: customerId,
          business_id: DEMO_BUSINESS_ID,
          name: op.n,
          phone: op.p,
          email: op.e,
          date_of_birth: null,
          preferences: null,
          dietary_details: null,
          dietary_details_source: null,
          dietary_details_recorded_at: null,
          anonymized_at: null,
          merged_into_customer_id: null,
          created_at: iso(op.at),
          updated_at: iso(op.at),
        });
        state.reservations.push({
          id: reservationId,
          business_id: DEMO_BUSINESS_ID,
          customer_id: customerId,
          service_type_id: op.s,
          time: op.w,
          ends_at: iso(Date.parse(op.w) + SESSION_MINUTES * 60_000),
          phone: op.p,
          email: op.e,
          note: null,
          status: "confirmed",
          guests: op.g,
          availability_override_by: null,
          availability_override_actor_name: null,
          availability_override_reason: null,
          availability_overridden_at: null,
          cancelled_at: null,
          cancelled_by: null,
          cancelled_late: null,
          no_show_at: null,
          no_show_note: null,
          reconfirmed_at: null,
          cancellation_window_minutes: null,
          arrival_grace_period_minutes: null,
          reminder_enabled: null,
          reminder_lead_minutes: null,
          reconfirmation_enabled: null,
          // No mail and no SMS leave a demo, so delivery is honestly nothing.
          delivery_state: "unavailable",
          created_at: iso(op.at),
          updated_at: iso(op.at),
        });
        break;
      }

      case "assign":
        state.assignments.set(`${op.k}:${op.i}`, op.tb);
        break;

      case "unassign":
        state.assignments.set(`${op.k}:${op.i}`, []);
        break;

      case "seat": {
        const source = partyFor(state, op.k, op.i, op.tb);
        if (!source) break;
        const seating: DemoSeating = {
          id: demoId("seating", index),
          source: { ...source, status: op.k === "queue" ? "seated" : source.status },
          table_ids: op.tb,
          opened_at: iso(op.at),
          closed_at: null,
          open_tab_id: null,
        };
        state.seatings.push(seating);
        state.seatingBySource.set(`${op.k}:${op.i}`, seating);
        state.assignments.set(`${op.k}:${op.i}`, []);
        if (op.k === "queue") state.seatedQueue.set(op.i, iso(op.at));
        break;
      }

      case "close": {
        const seating = state.seatings.find((candidate) => candidate.id === op.sg);
        if (seating) {
          seating.closed_at = iso(op.at);
          seating.open_tab_id = null;
          const tab = state.tabBySeating.get(seating.id);
          if (tab) {
            tab.closed_at = iso(op.at);
            tab.closed_by = actorId(op.u);
          }
          for (const [key, value] of state.seatingBySource) {
            if (value.id === seating.id) state.seatingBySource.delete(key);
          }
        } else {
          state.closedRecordedSeatings.add(op.sg);
        }
        break;
      }

      case "tab": {
        const seating = state.seatings.find((candidate) => candidate.id === op.sg);
        const tab: DemoTab = {
          id: demoId("tab", index),
          business_id: DEMO_BUSINESS_ID,
          table_id: seating?.table_ids[0] ?? null,
          seating_id: op.sg,
          customer_id: seating?.source.customer_id ?? null,
          status: "open",
          channel: "staff",
          opened_by: actorId(op.u),
          opened_at: iso(op.at),
          closed_by: null,
          closed_at: null,
          settled_method: null,
          current_settlement_event_id: null,
          settlement_events: [],
          total: 0,
          orders: [],
        };
        state.tabs.push(tab);
        state.tabsById.set(tab.id, tab);
        state.tabBySeating.set(op.sg, tab);
        if (seating) seating.open_tab_id = tab.id;
        break;
      }

      case "scan": {
        const table = TABLES.get(op.tb);
        if (!table) break;
        // A guest who re-opens the menu at the table they already scanned is
        // the same guest. Minting a second session would orphan the approval
        // staff had just given the first, and that is exactly the demo
        // sequence: the guest waits, the presenter approves at the staff
        // screen, the guest reloads to check. A denial still lets them ask
        // again, and a scan at another table still starts fresh.
        if (
          state.session &&
          state.session.table_id === op.tb &&
          state.session.status !== "denied"
        ) {
          break;
        }
        const seating = state.seatings.find(
          (candidate) => candidate.closed_at === null && candidate.table_ids.includes(op.tb),
        );
        state.session = {
          id: demoId("session", index),
          business_id: DEMO_BUSINESS_ID,
          table_id: op.tb,
          table_label: table.label,
          seating_id: seating?.id ?? null,
          // A scan asks; it does not let itself in. Staff answer it on the board.
          status: "pending",
          opened_at: iso(op.at),
          expires_at: iso(op.at + SESSION_MINUTES * 60_000),
        };
        break;
      }

      case "decide": {
        if (state.session && state.session.id === op.sn) {
          state.session.status = op.ok ? "approved" : "denied";
        }
        break;
      }

      case "order": {
        // A round from a table QR carries no tab: the seating's open tab takes
        // it, and if the seating has none yet, the round opens one. That is
        // what the backend does, and what the board's `open_tab_id` shows.
        let tab = op.b ? state.tabsById.get(op.b) ?? null : null;
        if (!tab && op.tb) {
          const seating = state.seatings.find(
            (candidate) => candidate.closed_at === null && candidate.table_ids.includes(op.tb!),
          );
          if (seating) {
            tab = state.tabBySeating.get(seating.id) ?? null;
            if (!tab) {
              tab = {
                id: demoId("tab", index),
                business_id: DEMO_BUSINESS_ID,
                table_id: seating.table_ids[0] ?? null,
                seating_id: seating.id,
                customer_id: seating.source.customer_id,
                status: "open",
                channel: op.c,
                opened_by: actorId(op.u),
                opened_at: iso(op.at),
                closed_by: null,
                closed_at: null,
                settled_method: null,
                current_settlement_event_id: null,
                settlement_events: [],
                total: 0,
                orders: [],
              };
              state.tabs.push(tab);
              state.tabsById.set(tab.id, tab);
              state.tabBySeating.set(seating.id, tab);
              seating.open_tab_id = tab.id;
            }
          }
        }
        // Nothing of the visitor's own answers for this round, so the
        // recording may: it was rung into a recorded tab, or scanned at a
        // table the recorded evening already has a tab open on. The round
        // belongs to that tab, and `project.ts` puts it back onto it on the
        // way out — the same side-map route a settlement against a recorded
        // tab already takes.
        const recordedTabId =
          tab !== null
            ? null
            : (op.b && RECORDED_TABS.has(op.b) ? op.b : null) ??
              (op.tb ? RECORDED_OPEN_TAB_BY_TABLE.get(op.tb) ?? null : null);
        const recordedTab = recordedTabId ? RECORDED_TABS.get(recordedTabId) ?? null : null;

        const order = buildOrder(
          op,
          index,
          tab?.id ?? recordedTabId,
          op.tb ?? tab?.table_id ?? recordedTab?.table_id ?? null,
        );
        state.orders.push(order);
        if (tab) {
          tab.orders.push(order);
          tab.total = tabTotal(tab);
          if (op.c === "qr") tab.channel = "qr";
        } else if (recordedTabId) {
          const added = state.recordedTabOrders.get(recordedTabId) ?? [];
          added.push(order);
          state.recordedTabOrders.set(recordedTabId, added);
        }
        break;
      }

      case "line": {
        const was = previousStatus(state, op.l, index);
        state.lineStatus.set(op.l, op.st);
        if (op.st === "served" && was !== "served") {
          const facts = lineFacts(state, op.l);
          if (facts) {
            state.servedDelta.set(
              facts.itemId,
              (state.servedDelta.get(facts.itemId) ?? 0) + facts.quantity,
            );
          }
        }
        const owning = state.orders.find((candidate) =>
          candidate.line_items.some((line) => line.id === op.l),
        );
        if (owning) {
          const line = owning.line_items.find((candidate) => candidate.id === op.l);
          if (line) line.line_status = op.st;
          const before = owning.status;
          owning.status = orderStatusFrom(owning.line_items.map((item) => item.line_status));
          if (owning.status !== before) {
            owning.status_timeline.push({
              id: demoId("timeline", index, 0),
              from_status: before,
              status: owning.status,
              changed_by: actorId(op.u),
              changed_at: iso(op.at),
            });
          }
        }
        break;
      }

      case "settle": {
        const event: DemoSettlement = {
          id: demoId("settlement", index),
          event_type: "settled_externally",
          actor_id: actorId(op.u),
          occurred_at: iso(op.at),
          currency_code: DEMO_CURRENCY,
          total_snapshot: totalFor(state, op.b),
          informational_method: op.m,
          note: op.nt,
          external_register_reference: op.r,
          related_settlement_event_id: null,
        };
        const tab = state.tabsById.get(op.b);
        if (tab) {
          tab.status = "settled_externally";
          tab.settlement_events = [event];
          tab.current_settlement_event_id = event.id;
          // A settled tab is no longer the seating's OPEN tab, which is what
          // holds the table until the register has been recorded.
          const seating = state.seatings.find((candidate) => candidate.id === tab.seating_id);
          if (seating) seating.open_tab_id = null;
        } else {
          state.recordedTabSettlements.set(op.b, event);
        }
        break;
      }

      case "call":
        state.calledQueue.set(op.q, iso(op.at));
        break;
    }
  });

  return state;
}

/** What a line was before the op at `index` moved it. */
function previousStatus(state: DemoState, lineId: string, index: number): LineStatus | null {
  for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
    const op = state.ops[earlier];
    if (op.t === "line" && op.l === lineId) return op.st;
  }
  const recorded = RECORDED_LINES.get(lineId);
  if (recorded) return recorded.lineStatus as LineStatus;
  const own = state.orders
    .flatMap((order) => order.line_items)
    .find((line) => line.id === lineId);
  return own ? "received" : null;
}

/** The item and quantity behind a line, wherever the line came from. */
function lineFacts(
  state: DemoState,
  lineId: string,
): { itemId: string; quantity: number } | null {
  const recorded = RECORDED_LINES.get(lineId);
  if (recorded) return { itemId: recorded.itemId, quantity: recorded.quantity };
  const own = state.orders
    .flatMap((order) => order.line_items)
    .find((line) => line.id === lineId);
  return own ? { itemId: own.item_id, quantity: own.quantity } : null;
}
