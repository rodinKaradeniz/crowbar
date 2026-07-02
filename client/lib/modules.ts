export const MODULE_KEYS = {
  RESERVATIONS: "reservations",
  QUEUE: "queue",
  ORDERING: "ordering",
  INVENTORY: "inventory",
  INSIGHTS: "insights",
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

export function hasModule(
  enabledModules: string[],
  module: ModuleKey
): boolean {
  return enabledModules.includes(module);
}
