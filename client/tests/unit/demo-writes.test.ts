import { describe, expect, it } from "vitest";

import { handleDemoRequest, type DemoResponse } from "@/lib/demo/handler";
import { DEMO_STATE_MAX_BYTES, encodeOps, type DemoOp } from "@/lib/demo/ops";
import { mintDemoToken, type DemoRole } from "@/lib/demo/token";

/**
 * The service loop, walked against the mock the way a visitor walks it in a
 * browser: one op log carried from call to call, exactly as the cookie carries
 * it. Every assertion is a read — what the page would show after the write,
 * not what the write returned.
 */

const BUSINESS = "00000000-0000-0000-0000-000000000002";
const SERVICE_TYPE = "00000000-0000-0000-0004-000000000010";
const FREE_TABLE = "00000000-0000-0024-0000-000000000201";
const MOJITO = "00000000-0000-0000-0008-000000000001";
const MARTINI = "00000000-0000-0000-0008-000000000010";
const WAITING_PARTY = "00000000-0000-0000-0013-000000000013";

/**
 * A fixed instant to walk at: a Monday, 21:00 in Berlin, mid-service. The
 * recording is shifted onto it, and the board's hold window is measured from
 * it, so nothing here depends on when the suite happens to run.
 */
const NOW = Date.parse("2026-09-21T19:00:00Z");

type Json = Record<string, unknown>;

/** A visitor: one op log, threaded through every call they make. */
function visitor() {
  let ops: DemoOp[] = [];
  const call = (
    method: string,
    path: string,
    options: { role?: DemoRole; body?: unknown; query?: string } = {},
  ): DemoResponse => {
    const result = handleDemoRequest({
      method,
      path,
      query: new URLSearchParams(options.query ?? ""),
      authorization: options.role
        ? `Bearer ${mintDemoToken(options.role, Math.floor(NOW / 1000))}`
        : null,
      body: options.body,
      ops,
      nowMs: NOW,
    });
    if (result.ops) ops = result.ops;
    return result;
  };
  return {
    call,
    read: (path: string, role?: DemoRole, query?: string) => call("GET", path, { role, query }),
    get ops() {
      return ops;
    },
  };
}

function boardTables(board: unknown): Json[] {
  return ((board as Json).areas as Json[]).flatMap((area) => area.tables as Json[]);
}

function tableOn(board: unknown, id: string): Json {
  return boardTables(board).find((table) => table.id === id) as Json;
}

describe("the demo service loop", () => {
  it("carries one evening from booking to a closed table", () => {
    const guest = visitor();

    // ── Book ────────────────────────────────────────────────────────────────
    const booked = guest.call("POST", "/api/reservations/public", {
      body: {
        business_id: BUSINESS,
        service_type_id: SERVICE_TYPE,
        // Twenty minutes out: inside the board's thirty-minute hold.
        time: new Date(NOW + 20 * 60_000).toISOString(),
        name: "Robin Demo",
        phone: "+12025550199",
        email: "robin.demo@example.com",
        guests: 2,
      },
    });
    expect(booked.status).toBe(201);
    const reservationId = (booked.body as Json).id as string;

    const confirmed = guest.read(
      `/api/reservations/business/${BUSINESS}`,
      "owner",
      "status=confirmed",
    );
    expect((confirmed.body as Json[]).some((row) => row.id === reservationId)).toBe(true);

    // A booking is not a table, and the guest has no name of their own until
    // one is made for them.
    const guests = guest.read(`/api/customers/business/${BUSINESS}`, "owner");
    expect((guests.body as Json[])[0]).toMatchObject({ name: "Robin Demo" });

    // The new booking is an arrival with no table yet, which is where the
    // host board shows it.
    const arrivals = (guest.read("/api/floor-plan/board", "host_server").body as Json)
      .unassigned_reservations as Json[];
    expect(arrivals[0]).toMatchObject({ source_id: reservationId, name: "Robin Demo" });

    // ── Plan onto a table ───────────────────────────────────────────────────
    const planned = guest.call("PUT", `/api/floor-plan/reservations/${reservationId}/tables`, {
      role: "host_server",
      body: { table_ids: [FREE_TABLE] },
    });
    expect(planned.status).toBe(204);

    let board = guest.read("/api/floor-plan/board", "host_server").body;
    expect(tableOn(board, FREE_TABLE)).toMatchObject({ display_state: "reserved" });
    // Planned is no longer unassigned.
    expect(
      ((board as Json).unassigned_reservations as Json[]).some(
        (party) => party.source_id === reservationId,
      ),
    ).toBe(false);
    expect((tableOn(board, FREE_TABLE).active_seating as unknown) ?? null).toBeNull();

    // ── Seat ────────────────────────────────────────────────────────────────
    const seated = guest.call("POST", "/api/floor-plan/seatings", {
      role: "host_server",
      body: { source_type: "reservation", source_id: reservationId, table_ids: [FREE_TABLE] },
    });
    expect(seated.status).toBe(201);
    const seatingId = (seated.body as Json).id as string;

    board = guest.read("/api/floor-plan/board", "host_server").body;
    expect(tableOn(board, FREE_TABLE)).toMatchObject({ display_state: "occupied" });
    expect((tableOn(board, FREE_TABLE).active_seating as Json).seating_id).toBe(seatingId);

    // ── Scan the QR, and the approval it waits for ──────────────────────────
    const qr = guest.read("/api/floor-plan/tables/qr", "owner").body as Json;
    const url = ((qr.areas as Json[])
      .flatMap((area) => area.tables as Json[])
      .find((table) => table.table_id === FREE_TABLE) as Json).url as string;
    const token = url.split("#table_token=")[1];

    const scanned = guest.call("POST", `/api/ordering/${BUSINESS}/table-sessions`, {
      body: { table_token: token, browser_nonce: "demo" },
    });
    expect(scanned.status).toBe(201);
    expect(scanned.body).toMatchObject({ status: "pending" });

    // A round before staff have answered is refused, as it is for real.
    expect(
      guest.call("POST", `/api/ordering/${BUSINESS}/orders`, {
        body: { items: [{ item_id: MOJITO, quantity: 2 }] },
      }).status,
    ).toBe(403);

    const pending = guest.read("/api/floor-plan/table-guest-sessions", "host_server", "status=pending")
      .body as Json[];
    expect(pending).toHaveLength(1);
    expect(
      guest.call("POST", `/api/floor-plan/table-guest-sessions/${pending[0].id}/approve`, {
        role: "host_server",
      }).status,
    ).toBe(204);

    // ── The guest's round ───────────────────────────────────────────────────
    const round = guest.call("POST", `/api/ordering/${BUSINESS}/orders`, {
      body: { items: [{ item_id: MOJITO, quantity: 2 }] },
    });
    expect(round.status).toBe(201);
    const order = round.body as Json;
    expect(order.total_amount).toBe(18);
    expect(order.table_identifier).toBe("B1");

    // The round opened a tab on the seating, and the board says so.
    board = guest.read("/api/floor-plan/board", "host_server").body;
    const tabId = (tableOn(board, FREE_TABLE).active_seating as Json).open_tab_id as string;
    expect(tabId).toBeTruthy();

    // ── A staff round on the same tab ───────────────────────────────────────
    const second = guest.call("POST", `/api/tabs/${tabId}/orders`, {
      role: "host_server",
      body: { items: [{ item_id: MARTINI, quantity: 1 }] },
    });
    expect(second.status).toBe(201);

    const tabs = guest.read("/api/tabs", "owner").body as Json[];
    const tab = tabs.find((candidate) => candidate.id === tabId) as Json;
    expect(tab.total).toBe(32);
    expect((tab.orders as Json[])).toHaveLength(2);

    // ── To the pass ─────────────────────────────────────────────────────────
    const servingsBefore = (
      guest.read(`/api/ordering/${BUSINESS}/menu-item-stock-flags`, "owner").body as Json[]
    ).find((flag) => flag.menu_item_id === MOJITO)?.servings_remaining as number;

    for (const placed of [order, second.body as Json]) {
      for (const line of placed.line_items as Json[]) {
        const moved = guest.call(
          "PATCH",
          `/api/ordering/${BUSINESS}/orders/${placed.id}/lines/${line.id}/status`,
          { role: "bar_kitchen", body: { status: "served" } },
        );
        expect(moved.status).toBe(200);
      }
    }

    const tickets = guest.read(`/api/ordering/${BUSINESS}/orders`, "bar_kitchen").body as Json[];
    expect(tickets.find((candidate) => candidate.id === order.id)).toMatchObject({
      status: "served",
    });

    // Servings left fall by what the pass sent out.
    const servingsAfter = (
      guest.read(`/api/ordering/${BUSINESS}/menu-item-stock-flags`, "owner").body as Json[]
    ).find((flag) => flag.menu_item_id === MOJITO)?.servings_remaining as number;
    expect(servingsAfter).toBe(servingsBefore - 2);

    // ── Settle, then close ──────────────────────────────────────────────────
    // The tab holds the table until the register has been recorded.
    expect(guest.call("POST", `/api/floor-plan/seatings/${seatingId}/close`, {
      role: "host_server",
    })).toMatchObject({ status: 409, body: { code: "TAB_STILL_OPEN" } });

    const settled = guest.call("POST", `/api/tabs/${tabId}/settle-externally`, {
      role: "owner",
      body: { informational_method: "card", external_register_reference: "REG-1/0299" },
    });
    expect(settled.status).toBe(200);
    expect(settled.body).toMatchObject({ status: "settled_externally" });
    expect(((settled.body as Json).settlement_events as Json[])[0]).toMatchObject({
      external_register_reference: "REG-1/0299",
      total_snapshot: 32,
    });

    // A settled tab stops being the seating's OPEN tab, which is what the
    // board reads to decide whether the table is still held.
    board = guest.read("/api/floor-plan/board", "host_server").body;
    expect((tableOn(board, FREE_TABLE).active_seating as Json).open_tab_id).toBeNull();

    expect(guest.call("POST", `/api/floor-plan/seatings/${seatingId}/close`, {
      role: "host_server",
    }).status).toBe(204);

    board = guest.read("/api/floor-plan/board", "host_server").body;
    expect(tableOn(board, FREE_TABLE)).toMatchObject({ display_state: "available" });
  });

  it("calls a waiting party and redraws the positions behind them", () => {
    const host = visitor();
    const before = host.read("/api/queue/entries", "host_server").body as Json[];
    expect(before.find((entry) => entry.id === WAITING_PARTY)).toMatchObject({
      status: "waiting",
      position: 1,
    });

    expect(
      host.call("POST", `/api/queue/entries/${WAITING_PARTY}/call`, { role: "host_server" }),
    ).toMatchObject({ status: 200, body: { status: "called", position: null } });

    const after = host.read("/api/queue/entries", "host_server").body as Json[];
    const behind = after.filter((entry) => entry.status === "waiting");
    expect(behind[0].position).toBe(1);

    // And a party the host seats leaves the walk-in list on the board.
    host.call("POST", "/api/floor-plan/seatings", {
      role: "host_server",
      body: {
        source_type: "queue",
        source_id: WAITING_PARTY,
        table_ids: ["00000000-0000-0024-0000-000000000202"],
      },
    });
    const board = host.read("/api/floor-plan/board", "host_server").body as Json;
    expect(
      (board.queue_entries as Json[]).some((party) => party.source_id === WAITING_PARTY),
    ).toBe(false);
  });
});

describe("what the demo refuses", () => {
  it("keeps the role gates the backend keeps", () => {
    const kitchen = visitor();
    // No floor.operate: the pass does not seat parties.
    expect(
      kitchen.call("POST", "/api/floor-plan/seatings", {
        role: "bar_kitchen",
        body: { source_type: "reservation", source_id: "x", table_ids: [FREE_TABLE] },
      }).status,
    ).toBe(403);
    // No queue.manage either.
    expect(
      kitchen.call("POST", `/api/queue/entries/${WAITING_PARTY}/call`, { role: "bar_kitchen" })
        .status,
    ).toBe(403);
    // And nothing at all without a session.
    expect(kitchen.call("POST", "/api/floor-plan/seatings", { body: {} }).status).toBe(401);
    expect(kitchen.ops).toHaveLength(0);
  });

  it("says so, rather than half-saving, outside the service loop", () => {
    const owner = visitor();
    const result = owner.call("PATCH", "/api/businesses/current", {
      role: "owner",
      body: { name: "Somewhere Else" },
    });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: "DEMO_NOT_SAVED" });
    expect(owner.ops).toHaveLength(0);
  });

  it("opens nothing for a QR code it has never seen", () => {
    const stranger = visitor();
    expect(
      stranger.call("POST", `/api/ordering/${BUSINESS}/table-sessions`, {
        body: { table_token: "forged", browser_nonce: "demo" },
      }).status,
    ).toBe(404);
  });

  it("asks the visitor to start again rather than losing what they did", () => {
    // A cookie is 4 KB and an evening is not bounded, so the log has an end.
    // What matters is that reaching it is said out loud and costs nothing that
    // was already done.
    const ops: DemoOp[] = [];
    for (let index = 0; index < 400; index += 1) {
      ops.push({
        t: "book",
        s: SERVICE_TYPE,
        w: new Date(NOW + index * 60_000).toISOString(),
        g: 2,
        n: `Guest ${index} of the long evening`,
        p: "+12025550199",
        e: `guest${index}@example.com`,
        at: NOW,
      });
    }
    expect(encodeOps(ops).length).toBeGreaterThan(DEMO_STATE_MAX_BYTES);

    // Trim back to the most a browser will hold, then ask for one more.
    while (encodeOps(ops).length > DEMO_STATE_MAX_BYTES) ops.pop();
    const result = handleDemoRequest({
      method: "POST",
      path: "/api/reservations/public",
      query: new URLSearchParams(),
      authorization: null,
      body: {
        service_type_id: SERVICE_TYPE,
        time: new Date(NOW).toISOString(),
        name: "One guest too many for one cookie",
        phone: "+12025550199",
        email: "late@example.com",
      },
      ops,
      nowMs: NOW,
    });
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: "DEMO_STATE_FULL" });
    // And the evening they already had is untouched.
    expect(result.ops).toBeUndefined();
  });
});
