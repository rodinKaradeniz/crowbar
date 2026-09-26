import recording from "./fixtures/recording.json";
import type { DemoRecording, RecordingAudience } from "./recording";

/**
 * The recorded evening, read as data rather than as responses.
 *
 * The mock answers most requests by handing back the body that was recorded
 * for them. A write needs more than that: to place a round it has to know what
 * a menu item costs, which station it routes to and what tax profile it
 * carries. All of that is already in the recording — in the menu the guest
 * page reads and in the order lines the ticket board shows — so this module
 * indexes it instead of restating it.
 *
 * Nothing here is invented. If the recording does not carry a fact, the demo
 * does without it.
 */

const data = recording as DemoRecording;

function recordedBody<T>(audience: RecordingAudience, key: string): T | null {
  const entry = data.responses[audience]?.[key];
  if (!entry || entry.body === undefined) return null;
  return (data.bodies[entry.body] ?? null) as T | null;
}

type Business = { id: string; slug: string; name: string; currency_code: string; timezone: string };

const business = recordedBody<Business>("owner", "GET /api/businesses/current");

/** The tenant the evening was recorded at. One business, and only one. */
export const DEMO_BUSINESS_ID = business?.id ?? "";

export interface MenuItemFacts {
  id: string;
  name: string;
  price: number;
  taxRate: number;
  priceIncludesTax: boolean;
  isAlcoholic: boolean;
  /** Taken from a recorded order line for the same item where one exists. */
  taxProfileId: string | null;
  taxProfileVersionId: string | null;
  taxProfileName: string | null;
  taxProfileCode: string | null;
  routingTag: string | null;
  preparationStationId: string | null;
  preparationStationName: string | null;
}

type RecordedLine = {
  item_id: string;
  tax_profile_id: string | null;
  tax_profile_version_id: string | null;
  tax_profile_name: string | null;
  tax_profile_code: string | null;
  routing_tag: string | null;
  preparation_station_id: string | null;
  preparation_station_name: string | null;
};
type RecordedOrder = { line_items: RecordedLine[] };

const routingByItem = new Map<string, RecordedLine>();
for (const order of recordedBody<RecordedOrder[]>(
  "owner",
  `GET /api/ordering/${DEMO_BUSINESS_ID}/orders`,
) ?? []) {
  for (const line of order.line_items ?? []) {
    if (!routingByItem.has(line.item_id)) routingByItem.set(line.item_id, line);
  }
}

/**
 * Preparation stations by id.
 *
 * A menu item carries the station it routes to, but only an order line carries
 * that station's NAME. An item nobody ordered on the recorded evening therefore
 * had no name to show, and its ticket badge read "Station". The stations list
 * is itself recorded, so the name is looked up here instead of invented.
 */
export const STATIONS: ReadonlyMap<string, string> = new Map(
  (recordedBody<{ id: string; name: string }[]>("owner", "GET /api/ordering/stations") ?? []).map(
    (station) => [station.id, station.name],
  ),
);

type MenuItem = {
  id: string;
  name: string;
  price: number;
  tax_rate: number;
  price_includes_tax: boolean;
  is_alcoholic: boolean;
  routing_tag?: string | null;
  preparation_station_id?: string | null;
  tax_profile_id?: string | null;
  tax_profile_name?: string | null;
  tax_profile_code?: string | null;
};
type MenuShape = { categories?: { items?: MenuItem[] }[] };

function indexMenus(menus: MenuShape[] | null, items: Map<string, MenuItemFacts>): void {
  for (const menu of menus ?? []) {
    for (const category of menu.categories ?? []) {
      for (const item of category.items ?? []) {
        if (items.has(item.id)) continue;
        const line = routingByItem.get(item.id);
        const stationId = item.preparation_station_id ?? line?.preparation_station_id ?? null;
        items.set(item.id, {
          id: item.id,
          name: item.name,
          price: Number(item.price),
          taxRate: Number(item.tax_rate),
          priceIncludesTax: item.price_includes_tax !== false,
          isAlcoholic: item.is_alcoholic === true,
          taxProfileId: item.tax_profile_id ?? line?.tax_profile_id ?? null,
          taxProfileVersionId: line?.tax_profile_version_id ?? null,
          taxProfileName: item.tax_profile_name ?? line?.tax_profile_name ?? null,
          taxProfileCode: item.tax_profile_code ?? line?.tax_profile_code ?? null,
          routingTag: item.routing_tag ?? line?.routing_tag ?? null,
          preparationStationId: stationId,
          preparationStationName:
            line?.preparation_station_name ??
            (stationId ? STATIONS.get(stationId) ?? null : null),
        });
      }
    }
  }
}

/**
 * Every item a guest or a server can put on a round, by id.
 *
 * The staff menu list comes first: it carries the routing and the tax profile,
 * which the public menu does not, and it holds the items a menu window has
 * closed on — a server can still ring one in. The public menu fills anything
 * it misses.
 */
export const MENU_ITEMS: ReadonlyMap<string, MenuItemFacts> = (() => {
  const items = new Map<string, MenuItemFacts>();
  indexMenus(
    recordedBody<MenuShape[]>("owner", `GET /api/ordering/${DEMO_BUSINESS_ID}/menus`),
    items,
  );
  indexMenus(
    recordedBody<MenuShape[]>("public", `GET /api/ordering/${DEMO_BUSINESS_ID}/menu`),
    items,
  );
  return items;
})();

type BoardTable = { id: string; label: string; capacity: number; area_id: string };
type Board = { areas: { tables: BoardTable[] }[]; timezone?: string; service_date?: string };

const board = recordedBody<Board>("owner", "GET /api/floor-plan/board");

/** Label and capacity per table id, for the writes that name a table. */
export const TABLES: ReadonlyMap<string, BoardTable> = new Map(
  (board?.areas ?? []).flatMap((area) => area.tables ?? []).map((table) => [table.id, table]),
);

type QrSheet = { areas: { tables: { table_id: string; url: string }[] }[] };

/**
 * The table a QR token belongs to.
 *
 * The demo cannot verify the token's signature — it has no key and no wish for
 * one — so it does the only honest thing available: it recognises the tokens
 * the recorded QR sheet carries and refuses every other string. A forged token
 * opens nothing.
 */
export const TABLE_BY_QR_TOKEN: ReadonlyMap<string, string> = (() => {
  const byToken = new Map<string, string>();
  for (const area of recordedBody<QrSheet>("owner", "GET /api/floor-plan/tables/qr")?.areas ?? []) {
    for (const table of area.tables ?? []) {
      const token = table.url.split("#table_token=")[1];
      if (token) byToken.set(token, table.table_id);
    }
  }
  return byToken;
})();

/** The tenant's own currency, as recorded. */
export const DEMO_CURRENCY = business?.currency_code ?? "EUR";

export interface RecordedReservation {
  id: string;
  customer_id: string | null;
  service_type_id: string;
  time: string;
  ends_at: string | null;
  guests: number;
  status: string;
  [key: string]: unknown;
}

/** Every reservation the evening was recorded with. */
export const RECORDED_RESERVATIONS: readonly RecordedReservation[] =
  recordedBody<RecordedReservation[]>(
    "owner",
    `GET /api/reservations/business/${DEMO_BUSINESS_ID}`,
  ) ?? [];

export interface RecordedQueueEntry {
  id: string;
  name: string;
  party_size: number;
  status: string;
  position: number | null;
  [key: string]: unknown;
}

/** Every queue party the evening was recorded with. */
export const RECORDED_QUEUE_ENTRIES: readonly RecordedQueueEntry[] =
  recordedBody<RecordedQueueEntry[]>("owner", "GET /api/queue/entries") ?? [];

/** The location the tables belong to; new orders carry it as recorded ones do. */
export const DEMO_LOCATION_ID: string | null =
  (recordedBody<{ location_id?: string }>("owner", "GET /api/floor-plan/board")?.location_id) ?? null;


export interface RecordedCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  [key: string]: unknown;
}

/** Guests the evening was recorded with, by id — a reservation carries only the id. */
export const RECORDED_CUSTOMERS: ReadonlyMap<string, RecordedCustomer> = new Map(
  (recordedBody<RecordedCustomer[]>(
    "owner",
    `GET /api/customers/business/${DEMO_BUSINESS_ID}`,
  ) ?? []).map((customer) => [customer.id, customer]),
);

export interface RecordedTab {
  id: string;
  seating_id: string | null;
  table_id: string | null;
  status: string;
  total: number;
  [key: string]: unknown;
}

/**
 * Every tab the evening was recorded with, by id.
 *
 * The visitor's world starts empty, so a round rung into one of these tabs has
 * nothing of its own to attach to. `state.ts` keeps such rounds in a side map
 * keyed by the recorded tab id and `project.ts` merges them back on the way
 * out, the same way a settlement against a recorded tab already works.
 */
export const RECORDED_TABS: ReadonlyMap<string, RecordedTab> = new Map(
  (recordedBody<RecordedTab[]>("owner", "GET /api/tabs") ?? []).map((tab) => [tab.id, tab]),
);

/**
 * The open tab a recorded table is carrying, by table id.
 *
 * A QR round arrives with a table and no tab. For a table the visitor seated
 * themselves the seating answers that; for a table the recording has occupied,
 * this does.
 */
export const RECORDED_OPEN_TAB_BY_TABLE: ReadonlyMap<string, string> = new Map(
  [...RECORDED_TABS.values()]
    .filter((tab) => tab.status === "open" && tab.table_id !== null)
    .map((tab) => [tab.table_id as string, tab.id]),
);

export interface RecordedLineFacts {
  orderId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  lineStatus: string;
  preparationStationId: string | null;
  preparationStationName: string | null;
}

/** Every order line on the recorded ticket board, by id. */
export const RECORDED_LINES: ReadonlyMap<string, RecordedLineFacts> = (() => {
  const lines = new Map<string, RecordedLineFacts>();
  type Line = {
    id: string;
    item_id: string;
    item_name: string;
    quantity: number;
    line_status: string;
    preparation_station_id: string | null;
    preparation_station_name: string | null;
  };
  type Order = { id: string; line_items: Line[] };
  for (const order of recordedBody<Order[]>(
    "owner",
    `GET /api/ordering/${DEMO_BUSINESS_ID}/orders`,
  ) ?? []) {
    for (const line of order.line_items ?? []) {
      lines.set(line.id, {
        orderId: order.id,
        itemId: line.item_id,
        itemName: line.item_name,
        quantity: Number(line.quantity),
        lineStatus: line.line_status,
        preparationStationId: line.preparation_station_id ?? null,
        preparationStationName: line.preparation_station_name ?? null,
      });
    }
  }
  return lines;
})();
