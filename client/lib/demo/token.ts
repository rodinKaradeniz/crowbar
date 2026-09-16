import type { StaffRole } from "@/lib/permissions";

/**
 * The demo session token.
 *
 * `proxy.ts` and `lib/auth.ts` decide access by DECODING the `rk-token` payload
 * without verifying it — the real API verifies. So the demo needs a token of the
 * right shape and nothing more.
 *
 * WORTHLESS AGAINST A REAL API, BY CONSTRUCTION. It is never signed (the third
 * segment is empty), so HS256 verification in `server/app/dependencies.py` and
 * `services/websocket_auth.py` rejects it. The repository's default dev secret
 * is public, which is exactly why this must never be signed with anything. The
 * audience and `token_use` are also the demo's own, so the real checks for
 * `crowbar-staff-api` / `staff_access` would fail even if it were.
 *
 * Standard base64 rather than base64url: both decoders above use `atob`, which
 * rejects `-` and `_`.
 */

export const DEMO_TOKEN_AUDIENCE = "crowbar-demo";
export const DEMO_TOKEN_USE = "demo";
const DEMO_SESSION_SECONDS = 8 * 60 * 60;

/** Roles a visitor can enter as, with the seeded demo user behind each. */
export const DEMO_ROLES = {
  owner: { userId: "00000000-0000-0000-0002-000000000010", label: "Owner" },
  host_server: {
    userId: "00000000-0000-0000-0002-000000000012",
    label: "Host / server",
  },
  bar_kitchen: {
    userId: "00000000-0000-0000-0002-000000000013",
    label: "Bar / kitchen",
  },
} as const satisfies Partial<Record<StaffRole, { userId: string; label: string }>>;

export type DemoRole = keyof typeof DEMO_ROLES;

export function isDemoRole(value: unknown): value is DemoRole {
  return typeof value === "string" && Object.hasOwn(DEMO_ROLES, value);
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

export function mintDemoToken(role: DemoRole, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = encode({ alg: "none", typ: "JWT" });
  const payload = encode({
    sub: DEMO_ROLES[role].userId,
    user_type: "staff",
    role,
    aud: DEMO_TOKEN_AUDIENCE,
    token_use: DEMO_TOKEN_USE,
    iat: nowSeconds,
    exp: nowSeconds + DEMO_SESSION_SECONDS,
  });
  return `${header}.${payload}.`;
}

export const DEMO_SESSION_MAX_AGE = DEMO_SESSION_SECONDS;

/**
 * The role a demo token carries, or null for anything that is not one — a
 * missing header, a real token, an expired or malformed one.
 */
export function readDemoRole(authorization: string | null, nowMs = Date.now()): DemoRole | null {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[2] !== "") return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    if (payload.aud !== DEMO_TOKEN_AUDIENCE || payload.token_use !== DEMO_TOKEN_USE) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < nowMs) return null;
    return isDemoRole(payload.role) ? payload.role : null;
  } catch {
    return null;
  }
}
