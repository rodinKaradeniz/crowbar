// Mirror of `server/app/core/permissions.py`.
//
// The server is the authority: every protected route re-checks the capability
// and returns 403 regardless of what this file says. This mirror exists so an
// ordinary staff member never *sees* a control the API would reject, and so
// server components can gate a whole page before rendering it.
//
// Generated from the Python module. Regenerate after changing the matrix:
//   cd server && venv/bin/python scripts/generate_permission_mirror.py
// `client/tests/unit/permissions.test.ts` fails if the two drift.

export const STAFF_ROLES = [
  "owner",
  "manager",
  "host_server",
  "bar_kitchen",
  "inventory_operator",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const CAPABILITIES = [
  "overview.view",
  "reservations.view",
  "reservations.manage",
  "reservations.override",
  "reservations.configure",
  "queue.view",
  "queue.manage",
  "queue.configure",
  "floor.view",
  "floor.operate",
  "floor.configure",
  "orders.view",
  "orders.take",
  "orders.fulfill",
  "menu.view",
  "menu.edit",
  "menu.configure",
  "menu.pricing",
  "stations.configure",
  "tabs.view",
  "tabs.operate",
  "tabs.settle",
  "tabs.reopen",
  "inventory.view",
  "inventory.movements",
  "inventory.items.manage",
  "inventory.counts.walk",
  "inventory.counts.manage",
  "inventory.cost.view",
  "purchasing.view",
  "purchasing.suppliers.manage",
  "purchasing.order.create",
  "purchasing.order.approve",
  "purchasing.receive",
  "customers.view",
  "customers.manage",
  "customers.privacy",
  "reports.service",
  "reports.cost",
  "reports.staff_actions",
  "insights.view",
  "insights.run",
  "staff.view",
  "staff.manage",
  "business.configure",
  "business.delete",
  "business.onboarding",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Operator-facing role names. The database stores the slug. */
export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  host_server: "Host / server",
  bar_kitchen: "Bar / kitchen",
  inventory_operator: "Inventory operator",
};

const ROLE_CAPABILITIES: Record<StaffRole, readonly Capability[]> = {
  owner: [
    "business.configure",
    "business.delete",
    "business.onboarding",
    "customers.manage",
    "customers.privacy",
    "customers.view",
    "floor.configure",
    "floor.operate",
    "floor.view",
    "insights.run",
    "insights.view",
    "inventory.cost.view",
    "inventory.counts.manage",
    "inventory.counts.walk",
    "inventory.items.manage",
    "inventory.movements",
    "inventory.view",
    "menu.configure",
    "menu.edit",
    "menu.pricing",
    "menu.view",
    "orders.fulfill",
    "orders.take",
    "orders.view",
    "overview.view",
    "purchasing.order.approve",
    "purchasing.order.create",
    "purchasing.receive",
    "purchasing.suppliers.manage",
    "purchasing.view",
    "queue.configure",
    "queue.manage",
    "queue.view",
    "reports.cost",
    "reports.service",
    "reports.staff_actions",
    "reservations.configure",
    "reservations.manage",
    "reservations.override",
    "reservations.view",
    "staff.manage",
    "staff.view",
    "stations.configure",
    "tabs.operate",
    "tabs.reopen",
    "tabs.settle",
    "tabs.view",
  ],
  manager: [
    "business.configure",
    "customers.manage",
    "customers.privacy",
    "customers.view",
    "floor.configure",
    "floor.operate",
    "floor.view",
    "insights.run",
    "insights.view",
    "inventory.cost.view",
    "inventory.counts.manage",
    "inventory.counts.walk",
    "inventory.items.manage",
    "inventory.movements",
    "inventory.view",
    "menu.configure",
    "menu.edit",
    "menu.pricing",
    "menu.view",
    "orders.fulfill",
    "orders.take",
    "orders.view",
    "overview.view",
    "purchasing.order.approve",
    "purchasing.order.create",
    "purchasing.receive",
    "purchasing.suppliers.manage",
    "purchasing.view",
    "queue.configure",
    "queue.manage",
    "queue.view",
    "reports.cost",
    "reports.service",
    "reports.staff_actions",
    "reservations.configure",
    "reservations.manage",
    "reservations.override",
    "reservations.view",
    "staff.manage",
    "staff.view",
    "stations.configure",
    "tabs.operate",
    "tabs.reopen",
    "tabs.settle",
    "tabs.view",
  ],
  host_server: [
    "customers.manage",
    "customers.view",
    "floor.operate",
    "floor.view",
    "menu.edit",
    "menu.view",
    "orders.fulfill",
    "orders.take",
    "orders.view",
    "overview.view",
    "queue.manage",
    "queue.view",
    "reservations.manage",
    "reservations.view",
    "tabs.operate",
    "tabs.settle",
    "tabs.view",
  ],
  bar_kitchen: [
    "customers.view",
    "floor.view",
    "inventory.counts.walk",
    "inventory.movements",
    "inventory.view",
    "menu.edit",
    "menu.view",
    "orders.fulfill",
    "orders.take",
    "orders.view",
    "overview.view",
    "queue.view",
    "reservations.view",
    "tabs.operate",
    "tabs.settle",
    "tabs.view",
  ],
  inventory_operator: [
    "inventory.counts.manage",
    "inventory.counts.walk",
    "inventory.items.manage",
    "inventory.movements",
    "inventory.view",
    "menu.view",
    "overview.view",
    "purchasing.order.create",
    "purchasing.receive",
    "purchasing.suppliers.manage",
    "purchasing.view",
  ],
};

/** Roles this actor may invite, edit, or remove. Mirrors
 * `ROLE_MANAGEMENT_AUTHORITY` — holding `staff.manage` opens the Staff
 * page, it does not say which roles you may hand out. */
export const MANAGEABLE_ROLES: Record<StaffRole, readonly StaffRole[]> = {
  owner: ["owner", "manager", "host_server", "bar_kitchen", "inventory_operator"],
  manager: ["host_server", "bar_kitchen", "inventory_operator"],
  host_server: [],
  bar_kitchen: [],
  inventory_operator: [],
};

export function capabilitiesFor(
  role: StaffRole | string | null | undefined
): readonly Capability[] {
  if (!role) return [];
  return ROLE_CAPABILITIES[role as StaffRole] ?? [];
}

/** Fails closed: an unknown or missing role holds nothing. */
export function hasCapability(
  role: StaffRole | string | null | undefined,
  capability: Capability
): boolean {
  return capabilitiesFor(role).includes(capability);
}

/** True when the role holds every one of the given capabilities. */
export function hasEveryCapability(
  role: StaffRole | string | null | undefined,
  capabilities: readonly Capability[]
): boolean {
  const held = capabilitiesFor(role);
  return capabilities.every((c) => held.includes(c));
}

/** True when the role holds at least one of the given capabilities. */
export function hasAnyCapability(
  role: StaffRole | string | null | undefined,
  capabilities: readonly Capability[]
): boolean {
  const held = capabilitiesFor(role);
  return capabilities.some((c) => held.includes(c));
}

export function manageableRoles(
  actorRole: StaffRole | string | null | undefined
): readonly StaffRole[] {
  if (!actorRole) return [];
  return MANAGEABLE_ROLES[actorRole as StaffRole] ?? [];
}

export function roleLabel(role: StaffRole | string | null | undefined): string {
  if (!role) return "No role";
  return ROLE_LABELS[role as StaffRole] ?? role;
}
