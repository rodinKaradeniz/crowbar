/**
 * Whether this build is the frontend-only demo.
 *
 * A BUILD decision, not a runtime toggle: `NEXT_PUBLIC_*` is inlined when Next
 * compiles, so a real deployment cannot be flipped into the demo without being
 * rebuilt with the flag. `next.config.ts` refuses to build a demo that points at
 * anything but a `/demo-api` mock, and a real build that points at one.
 *
 * Read it from here only, so every demo branch in the tree is findable by one
 * import.
 */
export const IS_DEMO = process.env.NEXT_PUBLIC_CROWBAR_DEMO === "true";

/** The path the mock answers on. The build guard keys off the same suffix. */
export const DEMO_API_PATH = "/demo-api";
