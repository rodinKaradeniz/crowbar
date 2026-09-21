import { cookies } from "next/headers";

import { DEMO_STATE_COOKIE, decodeOps, encodeOps, type DemoOp } from "./ops";
import { DEMO_SESSION_MAX_AGE } from "./token";

/**
 * The visitor's evening, in their own browser.
 *
 * A frontend-only demo has nowhere shared to put a write, so it puts it in a
 * cookie. That is the whole storage layer, and its limits are the demo's: what
 * one visitor does is theirs alone, another browser sees the recorded evening
 * untouched, and clearing the cookie starts over.
 *
 * Reading may happen in a server component; writing only ever happens in a
 * route handler, because only a GET reaches a server component. Both are
 * wrapped, because outside a request — a build-time metadata pass, a unit test
 * — `cookies()` throws, and an evening nobody is in the middle of is an empty
 * one rather than a crash.
 *
 * NEXT'S OWN CONTROL FLOW IS RE-THROWN. Reading a cookie is how a render says
 * it is dynamic, and that signal arrives as a throw; swallowing it would let a
 * demo page be prerendered at build time and then show every visitor the same
 * frozen evening. Those errors carry a `digest`, or are React's postpone.
 */

function isFrameworkSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (typeof (error as { digest?: unknown }).digest === "string") return true;
  return (error as { $$typeof?: symbol }).$$typeof === Symbol.for("react.postpone");
}

export async function readDemoOps(): Promise<DemoOp[]> {
  try {
    const store = await cookies();
    return decodeOps(store.get(DEMO_STATE_COOKIE)?.value);
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    return [];
  }
}

export async function writeDemoOps(ops: readonly DemoOp[]): Promise<void> {
  try {
    const store = await cookies();
    store.set(DEMO_STATE_COOKIE, encodeOps(ops), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: DEMO_SESSION_MAX_AGE,
      path: "/",
    });
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    // A context that cannot set cookies has no write to keep.
  }
}

export async function clearDemoOps(): Promise<void> {
  try {
    const store = await cookies();
    store.delete(DEMO_STATE_COOKIE);
  } catch (error) {
    if (isFrameworkSignal(error)) throw error;
    // Same: nothing to clear where nothing could be set.
  }
}
