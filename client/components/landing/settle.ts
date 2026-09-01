/**
 * The stagger ladder for the marketing intro.
 *
 * `.settle` and its three offsets are declared in `app/globals.css` — the
 * distance, the span and the per-sibling offset are tokens, and nothing about
 * the motion is decided here. This is only the order in which a section's own
 * children take those four classes, kept in one place so no section invents its
 * own rhythm.
 *
 * Four steps and no more: a fifth sibling arriving a quarter of the way further
 * down the scroll is a wait, not a rhythm. Longer lists cycle.
 */
export const SETTLE_STEP = [
  "settle",
  "settle-2",
  "settle-3",
  "settle-4",
] as const;
