import {
  DEMO_BUSINESS_ID,
  RECORDED_LINES,
  RECORDED_TABS,
  TABLES,
} from "./snapshot";
import { orderStatusFrom, partyFor, round2, type DemoState, type LineStatus } from "./state";

/**
 * The recorded evening as the visitor has left it.
 *
 * Every read the demo answers goes through here: the recorded body arrives,
 * the replayed log is laid over it, and what comes out is what the page
 * renders. Only the surfaces the service loop moves are projected — the board,
 * the tabs, the ticket board, the reservations list, the queue, the guest's
 * QR session and the per-item servings left. Everything else is handed back
 * exactly as recorded, which is the honest answer for a snapshot.
 */

export interface ProjectedResponse {
  status: number;
  body: unknown;
}

type Json = Record<string, unknown>;

/**
 * How long before a booking the board starts holding its table.
 * `RESERVATION_HOLD_MINUTES` in `server/app/services/floor_plan_service.py`.
 */
const RESERVATION_HOLD_MS = 30 * 60_000;

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Line statuses the visitor moved, applied to a recorded order in place. */
function applyLineStatuses(order: Json, state: DemoState): Json {
  const lines = (order.line_items as Json[] | undefined) ?? [];
  let touched = false;
  for (const line of lines) {
    const moved = state.lineStatus.get(line.id as string);
    if (moved && moved !== line.line_status) {
      line.line_status = moved;
      touched = true;
    }
  }
  if (touched) {
    order.status = orderStatusFrom(lines.map((line) => line.line_status as LineStatus));
  }
  return order;
}

function projectRecordedOrders(orders: Json[], state: DemoState): Json[] {
  return orders.map((order) => applyLineStatuses(clone(order), state));
}

/** A tab as it now stands: rounds re-checked, settlement and closing applied. */
function projectRecordedTab(tab: Json, state: DemoState): Json {
  const next = clone(tab);
  next.orders = projectRecordedOrders((next.orders as Json[] | undefined) ?? [], state);

  // Rounds the visitor rang into this recorded tab. They sit in `state.orders`
  // as well, but that is the ticket board's body and this is the tabs body, so
  // each round appears exactly once on each. The total is ADDED to rather than
  // recomputed: the recorded figure is the API's own answer for the recorded
  // rounds and stays whatever it was.
  const added = state.recordedTabOrders.get(next.id as string) ?? [];
  if (added.length > 0) {
    next.orders = [
      ...(next.orders as Json[]),
      ...added.map((order) => clone(order) as unknown as Json),
    ];
    next.total = round2(
      Number(next.total ?? 0) + added.reduce((sum, order) => sum + order.total_amount, 0),
    );
  }

  const settlement = state.recordedTabSettlements.get(next.id as string);
  if (settlement) {
    next.status = "settled_externally";
    next.settlement_events = [settlement];
    next.current_settlement_event_id = settlement.id;
  }
  if (state.closedRecordedSeatings.has(next.seating_id as string)) {
    next.closed_at = settlement?.occurred_at ?? next.closed_at;
  }
  return next;
}

function projectBoard(body: Json, state: DemoState, nowMs: number): Json {
  const board = clone(body);
  // Tables the visitor planned a party onto, and the party behind each.
  const plannedByTable = new Map<string, ReturnType<typeof partyOf>>();
  for (const [key, tableIds] of state.assignments) {
    for (const tableId of tableIds) plannedByTable.set(tableId, partyOf(state, key, tableIds));
  }
  const plannedSources = new Set(
    [...state.assignments].filter(([, tables]) => tables.length === 0).map(([key]) => key),
  );

  const seatedByTable = new Map<string, (typeof state.seatings)[number]>();
  for (const seating of state.seatings) {
    if (seating.closed_at) continue;
    for (const tableId of seating.table_ids) seatedByTable.set(tableId, seating);
  }

  for (const area of (board.areas as Json[] | undefined) ?? []) {
    for (const table of (area.tables as Json[] | undefined) ?? []) {
      const id = table.id as string;
      const recordedSeating = table.active_seating as Json | null;

      // A seating the visitor closed gives its tables back.
      if (
        recordedSeating &&
        state.closedRecordedSeatings.has(recordedSeating.seating_id as string)
      ) {
        table.active_seating = null;
        table.display_state = "available";
      }

      // A plan the visitor withdrew comes off the table.
      const recordedAssignment = table.active_assignment as Json | null;
      if (recordedAssignment) {
        const key = `${recordedAssignment.source_type}:${recordedAssignment.source_id}`;
        if (plannedSources.has(key)) {
          table.active_assignment = null;
          if (table.display_state === "reserved") table.display_state = "available";
        }
      }

      const seating = seatedByTable.get(id);
      if (seating) {
        const own = state.tabBySeating.get(seating.id);
        table.active_seating = {
          seating_id: seating.id,
          source: seating.source,
          table_ids: seating.table_ids,
          opened_at: seating.opened_at,
          open_tab_id: own && own.status === "open" ? own.id : null,
        };
        table.active_assignment = null;
        table.display_state = "occupied";
        continue;
      }

      // A plan the visitor made. The backend's own rule decides where it
      // shows: a queue party is an assignment outright, and a booking is one
      // only once its own window has started — before that it is the table's
      // next reservation, and only the hold makes the table read "reserved".
      // `floor_plan_service.py` is the authority for all three.
      const planned = plannedByTable.get(id);
      if (planned) {
        if (planned.source_type === "queue") {
          table.active_assignment = planned;
        } else {
          const startsAt = Date.parse(planned.starts_at ?? "");
          const endsAt = Date.parse(planned.ends_at ?? "");
          if (startsAt <= nowMs && nowMs < endsAt) {
            table.active_assignment = planned;
          } else if (startsAt > nowMs) {
            const already = table.next_reservation as Json | null;
            const alreadyAt = already ? Date.parse(String(already.starts_at)) : Infinity;
            if (startsAt < alreadyAt) table.next_reservation = planned;
          }
        }
        const soon = table.next_reservation as Json | null;
        const soonAt = soon ? Date.parse(String(soon.starts_at)) : NaN;
        const held = Number.isFinite(soonAt) && soonAt - nowMs <= RESERVATION_HOLD_MS;
        if (table.display_state === "available" || table.display_state === "reserved") {
          table.display_state = table.active_assignment || held ? "reserved" : "available";
        }
      }

      // A tab opened after the board was recorded still belongs on the card.
      const current = table.active_seating as Json | null;
      if (current) {
        const tab = state.tabBySeating.get(current.seating_id as string);
        if (tab) current.open_tab_id = tab.status === "open" ? tab.id : null;
        // A recorded tab the visitor settled stops holding its table too.
        if (state.recordedTabSettlements.has(current.open_tab_id as string)) {
          current.open_tab_id = null;
        }
      }
    }
  }

  // The two lists beside the room: who is waiting for a table, and who is in
  // the walk-in queue. A party the visitor has seated has left both.
  const settled = (party: Json): boolean => {
    const key = `${party.source_type}:${party.source_id}`;
    return state.seatingBySource.has(key) || (state.assignments.get(key)?.length ?? 0) > 0;
  };
  const retable = (party: Json): Json => {
    const planned = state.assignments.get(`${party.source_type}:${party.source_id}`);
    return planned ? { ...party, assigned_table_ids: planned } : party;
  };

  board.queue_entries = ((board.queue_entries as Json[] | undefined) ?? [])
    .filter((party) => !state.seatedQueue.has(party.source_id as string))
    .map((party) => {
      const calledAt = state.calledQueue.get(party.source_id as string);
      const next = retable(party);
      return calledAt && next.status === "waiting" ? { ...next, status: "called" } : next;
    });

  // A booking the visitor just made is an arrival with no table yet — which is
  // exactly what this list is, so it joins it, if it falls in tonight's window.
  const from = Date.parse(String(board.starts_at ?? ""));
  const until = Date.parse(String(board.ends_at ?? ""));
  const tonight = state.reservations.filter((reservation) => {
    const at = Date.parse(String(reservation.time ?? ""));
    return Number.isFinite(at) && at >= from && at <= until;
  });
  board.unassigned_reservations = [
    ...tonight
      .map((reservation) => partyFor(state, "reservation", reservation.id as string, []))
      .filter((party): party is NonNullable<typeof party> => party !== null)
      .filter((party) => !settled(party as unknown as Json)),
    ...((board.unassigned_reservations as Json[] | undefined) ?? [])
      .filter((party) => !settled(party))
      .map(retable),
  ];

  return board;
}

/** The party behind one of the visitor's plans, with the tables they chose. */
function partyOf(state: DemoState, key: string, tableIds: string[]) {
  const [sourceType, sourceId] = key.split(/:(.+)/);
  return partyFor(
    state,
    sourceType === "queue" ? "queue" : "reservation",
    sourceId,
    tableIds,
  );
}

/** The queue as it stands: called and seated parties moved, positions redrawn. */
function projectQueue(entries: Json[], state: DemoState): Json[] {
  const next = entries.map((entry) => {
    const copy = clone(entry);
    const id = copy.id as string;
    const seatedAt = state.seatedQueue.get(id);
    const calledAt = state.calledQueue.get(id);
    if (calledAt && copy.status === "waiting") {
      copy.status = "called";
      copy.called_at = calledAt;
      copy.position = null;
    }
    if (seatedAt) {
      copy.status = "seated";
      copy.seated_at = seatedAt;
      copy.position = null;
    }
    return copy;
  });
  let position = 0;
  for (const entry of next) {
    if (entry.status === "waiting") {
      position += 1;
      entry.position = position;
    }
  }
  return next;
}

/** Servings left, less what the pass sent out this evening. */
function projectStockFlags(flags: Json[], state: DemoState): Json[] {
  return flags.map((flag) => {
    const served = state.servedDelta.get(flag.menu_item_id as string) ?? 0;
    if (!served || typeof flag.servings_remaining !== "number") return flag;
    return { ...flag, servings_remaining: Math.max(0, flag.servings_remaining - served) };
  });
}

interface CountRow {
  preparation_station_id: string | null;
  preparation_station_name: string | null;
  routes_to_all_stations: boolean;
  item_name: string;
  line_status: string;
}

interface AllDayCount extends CountRow {
  quantity: number;
}

/**
 * The all-day list moves with the board it summarises.
 *
 * Adjusted rather than recomputed: the recorded list is the API's own answer
 * over its own window, and recomputing it from the orders the demo happens to
 * hold would quietly narrow it.
 */
function projectAllDayCounts(counts: AllDayCount[], state: DemoState): AllDayCount[] {
  const next = counts.map((count) => ({ ...count }));

  const move = (row: CountRow, status: string, delta: number) => {
    const found = next.find(
      (count) =>
        count.item_name === row.item_name &&
        count.preparation_station_id === row.preparation_station_id &&
        count.line_status === status,
    );
    if (found) {
      found.quantity += delta;
    } else if (delta > 0) {
      next.push({ ...row, line_status: status, quantity: delta });
    }
  };

  for (const [lineId, status] of state.lineStatus) {
    const recorded = RECORDED_LINES.get(lineId);
    if (!recorded || recorded.lineStatus === status) continue;
    const row = {
      preparation_station_id: recorded.preparationStationId,
      preparation_station_name: recorded.preparationStationName,
      routes_to_all_stations: false,
      item_name: recorded.itemName,
      line_status: recorded.lineStatus,
    };
    move(row, recorded.lineStatus, -recorded.quantity);
    move(row, status, recorded.quantity);
  }

  for (const order of state.orders) {
    for (const line of order.line_items) {
      move(
        {
          preparation_station_id: line.preparation_station_id,
          preparation_station_name: line.preparation_station_name,
          routes_to_all_stations: false,
          item_name: line.item_name,
          line_status: line.line_status,
        },
        line.line_status,
        line.quantity,
      );
    }
  }

  return next.filter((count) => count.quantity > 0);
}

/**
 * Lay the visitor's evening over one recorded read.
 *
 * `recorded` is what the recording holds for this request, or null when it
 * holds nothing. Returning null means "the recording's own answer stands".
 */
export function projectRead(
  path: string,
  query: URLSearchParams,
  recorded: ProjectedResponse | null,
  state: DemoState,
  nowMs: number,
): ProjectedResponse | null {
  const business = DEMO_BUSINESS_ID;
  const body = recorded?.body;

  if (path === "/api/floor-plan/board" && body) {
    return { status: 200, body: projectBoard(body as Json, state, nowMs) };
  }

  if (path === "/api/tabs") {
    const recordedTabs = ((body as Json[] | undefined) ?? []).map((tab) =>
      projectRecordedTab(tab, state),
    );
    return { status: 200, body: [...state.tabs, ...recordedTabs] };
  }

  const tab = /^\/api\/tabs\/([^/]+)$/.exec(path);
  if (tab) {
    const own = state.tabsById.get(tab[1]);
    if (own) return { status: 200, body: own };
    // The recorder walked the tabs LIST but never a single tab, so there is no
    // recorded body to lay the evening over. The index holds the tab itself,
    // which is the same object the list is built from, so the detail answers
    // from that rather than saying a tab the list just showed is not in the
    // demo.
    const indexed = RECORDED_TABS.get(tab[1]);
    if (indexed) {
      return { status: 200, body: projectRecordedTab(indexed as unknown as Json, state) };
    }
    if (body) return { status: recorded!.status, body: projectRecordedTab(body as Json, state) };
  }

  if (path === `/api/ordering/${business}/orders`) {
    return {
      status: 200,
      body: [...state.orders, ...projectRecordedOrders((body as Json[] | undefined) ?? [], state)],
    };
  }

  if (path === "/api/ordering/all-day-counts") {
    return {
      status: 200,
      body: projectAllDayCounts(((body as AllDayCount[] | undefined) ?? []), state),
    };
  }

  if (path === `/api/reservations/business/${business}`) {
    const wanted = query.get("status");
    const mine = state.reservations.filter(
      (reservation) => !wanted || reservation.status === wanted,
    );
    return { status: 200, body: [...mine, ...((body as Json[] | undefined) ?? [])] };
  }

  if (path === `/api/customers/business/${business}`) {
    return { status: 200, body: [...state.customers, ...((body as Json[] | undefined) ?? [])] };
  }

  const customer = /^\/api\/customers\/([^/]+)$/.exec(path);
  if (customer) {
    const mine = state.customers.find((candidate) => candidate.id === customer[1]);
    if (mine) return { status: 200, body: mine };
  }

  if (path === "/api/queue/entries" || path === `/api/queue/${business}/entries`) {
    return { status: 200, body: projectQueue((body as Json[] | undefined) ?? [], state) };
  }

  if (path === `/api/ordering/${business}/menu-item-stock-flags`) {
    return { status: 200, body: projectStockFlags((body as Json[] | undefined) ?? [], state) };
  }

  if (path === `/api/ordering/${business}/table-sessions/current`) {
    const session = state.session;
    if (!session) return null;
    return {
      status: 200,
      body: {
        status: session.status,
        table_label: session.table_label,
        expires_at: session.expires_at,
      },
    };
  }

  if (path === "/api/floor-plan/table-guest-sessions") {
    const wanted = query.get("status") ?? "pending";
    const session = state.session;
    const pending =
      session && session.status === wanted
        ? [
            {
              id: session.id,
              table_id: session.table_id,
              seating_id: session.seating_id,
              table_label: session.table_label,
              status: session.status,
              expires_at: session.expires_at,
              created_at: session.opened_at,
            },
          ]
        : [];
    return { status: 200, body: [...pending, ...((body as Json[] | undefined) ?? [])] };
  }

  const assignment = /^\/api\/floor-plan\/(reservations|queue)\/([^/]+)\/tables$/.exec(path);
  if (assignment) {
    const kind = assignment[1] === "queue" ? "queue" : "reservation";
    const planned = state.assignments.get(`${kind}:${assignment[2]}`);
    if (planned) {
      return {
        status: 200,
        body: {
          source_type: kind,
          source_id: assignment[2],
          table_ids: planned,
          tables: planned.map((id) => ({
            id,
            label: TABLES.get(id)?.label ?? "",
            capacity: TABLES.get(id)?.capacity ?? 0,
          })),
          capacity_override_reason: null,
        },
      };
    }
  }

  const reservation = /^\/api\/reservations\/([0-9a-f-]{36})$/.exec(path);
  if (reservation) {
    const mine = state.reservations.find((candidate) => candidate.id === reservation[1]);
    if (mine) return { status: 200, body: mine };
  }

  const order = /^\/api\/ordering\/[^/]+\/orders\/([^/]+)$/.exec(path);
  if (order) {
    const mine = state.orders.find((candidate) => candidate.id === order[1]);
    if (mine) return { status: 200, body: mine };
  }

  return null;
}
