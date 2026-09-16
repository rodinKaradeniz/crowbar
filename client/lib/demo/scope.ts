/**
 * What the demo covers.
 *
 * The demo is a read-only snapshot of one evening at the seeded tenant. The
 * service loop and the public guest pages are in it; everything else — account
 * flows, venue setup, and links that need a signed guest credential — lands on
 * a designed "not in the demo" page instead of a crash or a spinner.
 *
 * `next.config.ts` turns these into rewrites in demo builds only. Rewrites run
 * after `proxy.ts`, so a signed-out visitor is still sent to sign in first.
 * Patterns use Next's path-matching syntax.
 */

/** Workspace routes out of the demo. Rewritten inside the workspace layout. */
export const WORKSPACE_ROUTES_NOT_IN_DEMO = [
  "/business/onboarding",
  "/business/requests",
  "/business/inventory/counts/:path*",
  "/business/profile",
  "/business/profile/:path*",
  "/business/settings",
  "/business/settings/:path*",
] as const;

/** Public routes out of the demo. */
export const PUBLIC_ROUTES_NOT_IN_DEMO = [
  "/auth",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/verify-email",
  "/invite",
  "/reserve/manage",
  "/reserve/waitlist",
  "/reserve/waitlist/manage",
] as const;

export const WORKSPACE_NOT_IN_DEMO_PAGE = "/business/not-in-demo";
export const PUBLIC_NOT_IN_DEMO_PAGE = "/not-in-demo";
