/**
 * The declared categorical set — DESIGN.md open questions 1 and 2, answered.
 *
 * Two places in the product needed a colour that is neither a severity nor
 * brand: the Insights charts, and the colour a venue picks for each service
 * type. Both were held on raw hex outside the token block. This module is the
 * single door to the five declared slots, so no call site handles a literal
 * again.
 *
 * WHY FIVE AND NOT TWELVE. The rank reserves three sectors of the colour wheel
 * — critical, attend, and brand green — and five is the largest set that still
 * clears the normal-vision separation floor once they are removed. The old
 * picker's twelve arbitrary hues could not: several sat close enough to the
 * severity fills to read as an alarm. Reducing the picker is the feature
 * change that answers the design question; re-tinting twelve was not available.
 *
 * WHAT IS STORED. A service-type colour is tenant data and stays a hex string
 * in the database, so nothing here needs a migration. The picker offers only
 * the five declared values, and rendering always goes through
 * `seriesVarForColor`, which maps a stored hex to its slot. Colours stored
 * before this palette existed resolve to their nearest slot rather than
 * rendering an undeclared hue.
 */

/** The five slots, in assignment order. Assign in order; never cycle. */
export const SERIES_SLOTS = [1, 2, 3, 4, 5] as const;
export type SeriesSlot = (typeof SERIES_SLOTS)[number];

/**
 * The declared values, duplicated from the `--series-*` tokens in
 * `app/globals.css`. They live here too because a service-type colour is
 * persisted as a string and a CSS variable cannot be written to the database.
 * `globals.css` remains the source of truth for rendering.
 */
export const SERIES_HEX: Record<SeriesSlot, string> = {
  1: "#0a9c95",
  2: "#6a69bf",
  3: "#967a23",
  4: "#a85386",
  5: "#2291e0",
};

/** Operator-facing names. Colour is never the sole carrier of meaning. */
export const SERIES_NAME: Record<SeriesSlot, string> = {
  1: "Teal",
  2: "Periwinkle",
  3: "Ochre",
  4: "Plum",
  5: "Blue",
};

/** The CSS custom property for a slot — always prefer this over a literal. */
export function seriesVar(slot: SeriesSlot): string {
  return `var(--series-${slot})`;
}

/**
 * Colours stored before the palette was declared, mapped to their nearest
 * declared slot by OKLab distance (computed once, not at runtime). Keeps every
 * venue's existing service types rendering something from the system until
 * they re-pick.
 */
const LEGACY_TO_SLOT: Record<string, SeriesSlot> = {
  "#3b82f6": 5, // Blue
  "#10b981": 1, // Green
  "#f59e0b": 3, // Amber
  "#ef4444": 4, // Red
  "#8b5cf6": 2, // Purple
  "#ec4899": 4, // Pink
  "#06b6d4": 1, // Cyan
  "#84cc16": 1, // Lime
  "#f97316": 3, // Orange
  "#6366f1": 2, // Indigo
  "#14b8a6": 1, // Teal
  "#a855f7": 2, // Violet
};

const HEX_TO_SLOT: Record<string, SeriesSlot> = {
  ...LEGACY_TO_SLOT,
  ...Object.fromEntries(
    SERIES_SLOTS.map((slot) => [SERIES_HEX[slot], slot]),
  ),
};

/** The slot a stored colour resolves to, or `null` when it is unrecognised. */
export function slotForColor(color: string | null | undefined): SeriesSlot | null {
  if (!color) return null;
  return HEX_TO_SLOT[color.trim().toLowerCase()] ?? null;
}

/**
 * The CSS value to paint a stored service-type colour with.
 *
 * Returns a token, never the stored string. An unrecognised colour falls back
 * to the muted foreground rather than painting a hue the system never
 * declared — an unknown colour is not a licence to invent one.
 */
export function seriesVarForColor(color: string | null | undefined): string {
  const slot = slotForColor(color);
  return slot ? seriesVar(slot) : "var(--muted-foreground)";
}

/** Chart series colour by index, assigned in fixed order and never cycled. */
export function seriesVarForIndex(index: number): string {
  const slot = SERIES_SLOTS[index];
  return slot ? seriesVar(slot) : "var(--muted-foreground)";
}
