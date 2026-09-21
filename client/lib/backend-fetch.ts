import { IS_DEMO } from "@/lib/demo/mode";

/**
 * The one place server-side code reaches the backend.
 *
 * `API_INTERNAL_URL` (the private address on a real deployment) falls back to
 * the public `NEXT_PUBLIC_API_URL`, then to the local API. Paths are JOINED as
 * strings rather than resolved with `new URL(path, base)`, which discards any
 * path the base URL carries.
 *
 * IN A DEMO BUILD WITH NO BACKEND CONFIGURED, THERE IS NO REQUEST. The mock
 * answers in this process, so a frontend-only deployment never opens a
 * connection to anything — not to a backend, not to itself. Pointing a demo
 * build at a `/demo-api` URL (a deployed demo's own mock) takes the fetch path
 * instead; `next.config.ts` refuses any other combination.
 *
 * Callers get a real `Response` either way, so error, status and body handling
 * stay identical on both paths.
 */

const CONFIGURED_BACKEND_URL =
  process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "";

export const BACKEND_URL = CONFIGURED_BACKEND_URL || "http://localhost:8000";

/** True when this build answers backend calls itself, in this process. */
export const IS_SELF_CONTAINED_DEMO = IS_DEMO && CONFIGURED_BACKEND_URL === "";

export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  if (IS_SELF_CONTAINED_DEMO) {
    // Dynamic so the mock and its fixtures never enter a real build's bundle.
    const { demoResponse } = await import("@/lib/demo/in-process");
    return demoResponse(path, init);
  }
  return fetch(`${BACKEND_URL.replace(/\/+$/, "")}${path}`, init);
}
