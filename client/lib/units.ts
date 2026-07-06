// Inventory unit-of-measure helpers (Tier B pour/keg + recipes).
//
// Canonical storage for liquids is milliliters (ml). 'bottle' and 'keg' items
// store current_quantity/par_quantity in ml; they differ only in which container
// presets we surface. Recipe quantities are stored in the linked item's native
// unit — ml for bottle/keg, count for 'each'. The oz toggle in the recipe builder
// is a pure UI convenience: everything is converted to ml before it leaves the client.

export type UnitType = "each" | "bottle" | "keg";

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  each: "Each (countable)",
  bottle: "Bottle (liquid, ml)",
  keg: "Keg (liquid, ml)",
};

export function isLiquidUnitType(t: string | undefined | null): boolean {
  return t === "bottle" || t === "keg";
}

// 1 US fluid ounce = 29.5735 ml.
export const ML_PER_OZ = 29.5735;

export function ozToMl(oz: number): number {
  return oz * ML_PER_OZ;
}

export function mlToOz(ml: number): number {
  return ml / ML_PER_OZ;
}

export interface ContainerPreset {
  label: string;
  ml: number;
}

// Preset container volumes (ml) to PREFILL container_volume_ml. Not a locked
// enum — the field stays free-entry so staff can input a nonstandard size.
export const BOTTLE_PRESETS: ContainerPreset[] = [
  { label: "750 ml (standard)", ml: 750 },
  { label: "1 L", ml: 1000 },
  { label: "1.75 L (handle)", ml: 1750 },
];

export const KEG_PRESETS: ContainerPreset[] = [
  { label: "Sixth barrel (US) — 19,550 ml", ml: 19550 },
  { label: "Quarter barrel (US) — 29,340 ml", ml: 29340 },
  { label: "Half barrel (US) — 58,670 ml", ml: 58670 },
  { label: "20 L (metric)", ml: 20000 },
  { label: "30 L (metric)", ml: 30000 },
  { label: "50 L (metric)", ml: 50000 },
];

export function presetsForUnitType(t: string | undefined | null): ContainerPreset[] {
  if (t === "bottle") return BOTTLE_PRESETS;
  if (t === "keg") return KEG_PRESETS;
  return [];
}

// Reference pour-size presets for the optional default_pour_ml field (bottle/keg).
// Each carries a canonical (value, unit) pair so selecting one sets both the input
// and the ml/oz toggle unambiguously — US bar pours are oz-native, metric are ml.
// The stored value is always ml (oz is converted via ozToMl before send).
export interface PourPreset {
  label: string;
  value: number;
  unit: "ml" | "oz";
}

export const POUR_PRESETS: PourPreset[] = [
  { label: "1 oz", value: 1, unit: "oz" },
  { label: "1.5 oz (jigger)", value: 1.5, unit: "oz" },
  { label: "2 oz (double)", value: 2, unit: "oz" },
  { label: "25 ml", value: 25, unit: "ml" },
  { label: "50 ml", value: 50, unit: "ml" },
];
