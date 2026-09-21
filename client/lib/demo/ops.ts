import { gunzipSync, gzipSync } from "node:zlib";

import type { DemoRole } from "./token";

/**
 * What a visitor did, and where it is kept.
 *
 * The demo has no database and no backend, so a write cannot be stored
 * anywhere shared. It is stored in the visitor's own cookie as an append-only
 * log of what they asked for, and every read replays that log over the
 * recorded evening. The consequences are worth stating plainly, because the
 * demo states them to the visitor too: changes are this browser's alone, they
 * survive a reload, and they are gone when the cookie is.
 *
 * Ops carry INPUTS, not results. Ids for the things they create come from
 * `ids.ts` by position, so nothing is stored that can be computed. Keys are
 * short for the same reason — there are about 3 KB to work with.
 */

interface OpBase {
  /** When it happened, epoch ms. */
  at: number;
  /** The role that did it, absent for a guest. */
  u?: DemoRole;
}

/** Book: the public reservation form or the staff dialog. */
export interface BookOp extends OpBase {
  t: "book";
  /** Service type id. */
  s: string;
  /** The absolute start the server offered, as the form submitted it. */
  w: string;
  g: number;
  n: string;
  p: string;
  e: string;
}
/** Plan a party onto tables, without seating it. */
export interface AssignOp extends OpBase {
  t: "assign";
  k: "reservation" | "queue";
  i: string;
  tb: string[];
}
/** Take the plan off those tables again. */
export interface UnassignOp extends OpBase {
  t: "unassign";
  k: "reservation" | "queue";
  i: string;
}
/** Open a seating: the party is at the table now. */
export interface SeatOp extends OpBase {
  t: "seat";
  k: "reservation" | "queue";
  i: string;
  tb: string[];
}
/** Close the seating and return the tables to ready. */
export interface CloseOp extends OpBase {
  t: "close";
  sg: string;
}
/** Open a tab against a seating. */
export interface TabOp extends OpBase {
  t: "tab";
  sg: string;
}
/** A guest scanned a table QR. The session it opens is staff's to answer. */
export interface ScanOp extends OpBase {
  t: "scan";
  tb: string;
}
/** Staff answered a scan on the floor board. */
export interface DecideScanOp extends OpBase {
  t: "decide";
  sn: string;
  ok: boolean;
}
/** A round. `it` is `[menu item id, quantity]` per line. */
export interface OrderOp extends OpBase {
  t: "order";
  /** Tab id, when the round goes on one. */
  b: string | null;
  tb: string | null;
  c: "qr" | "staff";
  it: [string, number][];
}
/** Move one order line along the ticket board. */
export interface LineOp extends OpBase {
  t: "line";
  l: string;
  st: "received" | "preparing" | "ready" | "served";
}
/** Record that the register settled the tab. */
export interface SettleOp extends OpBase {
  t: "settle";
  b: string;
  m: string | null;
  nt: string | null;
  r: string | null;
}
/** Call a waiting queue party. */
export interface CallOp extends OpBase {
  t: "call";
  q: string;
}

export type DemoOp =
  | BookOp
  | AssignOp
  | UnassignOp
  | SeatOp
  | CloseOp
  | TabOp
  | ScanOp
  | DecideScanOp
  | OrderOp
  | LineOp
  | SettleOp
  | CallOp;

/**
 * The cookie the log lives in. Not `rk-token`: the session and what the
 * visitor did are separate, so signing out as one role and in as another keeps
 * the evening they have been building.
 */
export const DEMO_STATE_COOKIE = "rk-demo";

/**
 * How much encoded log a browser will hold. A cookie is capped at 4096 bytes
 * including its name and attributes; this leaves room for those and for the
 * session cookie beside it. A write past the cap is refused in words rather
 * than dropped in silence — see `DEMO_STATE_FULL` in `writes.ts`.
 */
export const DEMO_STATE_MAX_BYTES = 3800;

/**
 * Deflated, then base64url so the value never needs percent-escaping.
 *
 * The log is mostly the same few dozen identifiers over and over, which is
 * exactly what deflate is good at — about four times as much evening fits in
 * the one cookie there is. Server-side only, like everything that touches the
 * log.
 */
export function encodeOps(ops: readonly DemoOp[]): string {
  return gzipSync(Buffer.from(JSON.stringify(ops), "utf8"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Anything unreadable is an empty evening, never an error: a stale or
 * hand-edited cookie must not break the page it arrives on.
 */
export function decodeOps(value: string | undefined | null): DemoOp[] {
  if (!value) return [];
  try {
    const packed = Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const json = gunzipSync(packed).toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (op): op is DemoOp =>
        typeof op === "object" && op !== null && typeof (op as DemoOp).t === "string",
    );
  } catch {
    return [];
  }
}

/** True when the log with this op appended would no longer fit. */
export function wouldOverflow(ops: readonly DemoOp[], next: DemoOp): boolean {
  return encodeOps([...ops, next]).length > DEMO_STATE_MAX_BYTES;
}
