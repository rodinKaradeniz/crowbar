import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAPABILITIES,
  MANAGEABLE_ROLES,
  ROLE_LABELS,
  STAFF_ROLES,
  capabilitiesFor,
  hasAnyCapability,
  hasCapability,
  hasEveryCapability,
  manageableRoles,
  roleLabel,
  type Capability,
  type StaffRole,
} from "@/lib/permissions";

/**
 * The frontend mirror only earns its place if it agrees with the server.
 *
 * If it drifts, ordinary staff either see controls the API will reject — the
 * exact failure `docs/RULES.md` forbids — or lose access to work they are
 * entitled to do. So the checked-in mirror is compared against the Python
 * matrix it was generated from, rather than against a hand-written fixture that
 * would drift alongside it.
 */
const PERMISSIONS_PY = join(
  process.cwd(),
  "..",
  "server",
  "app",
  "core",
  "permissions.py",
);

function pythonSource(): string {
  return readFileSync(PERMISSIONS_PY, "utf8");
}

/** Pull a quoted-string list out of a Python literal block. */
function pythonStrings(source: string, startMarker: string, endMarker: string): string[] {
  const start = source.indexOf(startMarker);
  expect(start, `could not find ${startMarker} in permissions.py`).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start + startMarker.length);
  const block = source.slice(start + startMarker.length, end);
  return Array.from(block.matchAll(/"([a-z_.]+)"/g)).map((match) => match[1]);
}

describe("the permission mirror matches the server", () => {
  it("declares exactly the server's roles, in the same order", () => {
    const source = pythonSource();
    // ROLES lists the constants, not the literals, so resolve them first.
    const constants = new Map(
      Array.from(source.matchAll(/^([A-Z_]+) = "([a-z_]+)"$/gm)).map((m) => [
        m[1],
        m[2],
      ]),
    );
    const start = source.indexOf("ROLES: tuple[str, ...] = (");
    const block = source.slice(start, source.indexOf("\n)", start));
    const roles = Array.from(block.matchAll(/^ {4}([A-Z_]+),$/gm)).map((m) => {
      const resolved = constants.get(m[1]);
      expect(resolved, `${m[1]} has no literal in permissions.py`).toBeTruthy();
      return resolved;
    });
    expect([...STAFF_ROLES]).toEqual(roles);
  });

  it("declares exactly the server's capabilities", () => {
    const source = pythonSource();
    const capabilities = pythonStrings(
      source,
      "CAPABILITIES: tuple[str, ...] = (",
      "\n)",
    );
    expect([...CAPABILITIES].sort()).toEqual([...capabilities].sort());
  });

  it("grants each role the same capability set the server does", () => {
    const source = pythonSource();

    // Manager is defined by subtraction on the server, so derive it the same way.
    const ownerOnly = ["business.delete", "business.onboarding"];
    const expected: Record<StaffRole, string[]> = {
      owner: [...CAPABILITIES],
      manager: CAPABILITIES.filter((c) => !ownerOnly.includes(c)),
      host_server: pythonStrings(
        source,
        "_HOST_SERVER_CAPABILITIES = frozenset(",
        "\n)",
      ),
      bar_kitchen: pythonStrings(
        source,
        "_BAR_KITCHEN_CAPABILITIES = frozenset(",
        "\n)",
      ),
      inventory_operator: pythonStrings(
        source,
        "_INVENTORY_OPERATOR_CAPABILITIES = frozenset(",
        "\n)",
      ),
    };

    for (const role of STAFF_ROLES) {
      expect(
        [...capabilitiesFor(role)].sort(),
        `${role} drifted from the server matrix`,
      ).toEqual([...expected[role]].sort());
    }
  });
});

describe("capability lookups fail closed", () => {
  it("gives an unknown role nothing", () => {
    // A sixth role added to the database ahead of the code must deny, not
    // fall through to a default.
    expect(capabilitiesFor("regional_director")).toEqual([]);
    for (const capability of CAPABILITIES) {
      expect(hasCapability("regional_director", capability)).toBe(false);
    }
  });

  it("gives a missing role nothing", () => {
    expect(capabilitiesFor(null)).toEqual([]);
    expect(capabilitiesFor(undefined)).toEqual([]);
    expect(hasCapability(null, "reports.service")).toBe(false);
    expect(hasCapability("", "reports.service")).toBe(false);
  });

  it("requires all of hasEveryCapability and any of hasAnyCapability", () => {
    const both: Capability[] = ["inventory.view", "inventory.cost.view"];
    expect(hasEveryCapability("manager", both)).toBe(true);
    // An inventory operator counts stock but does not read margins.
    expect(hasEveryCapability("inventory_operator", both)).toBe(false);
    expect(hasAnyCapability("inventory_operator", both)).toBe(true);
    expect(hasAnyCapability("host_server", both)).toBe(false);
  });
});

describe("the role matrix encodes the pilot's actual jobs", () => {
  it("keeps cost and reporting figures managerial", () => {
    for (const capability of [
      "inventory.cost.view",
      "reports.service",
      "reports.cost",
      "reports.staff_actions",
    ] as Capability[]) {
      expect(hasCapability("owner", capability)).toBe(true);
      expect(hasCapability("manager", capability)).toBe(true);
      for (const role of ["host_server", "bar_kitchen", "inventory_operator"] as const) {
        expect(hasCapability(role, capability), `${role} read ${capability}`).toBe(false);
      }
    }
  });

  it("lets the floor settle a tab but not reopen one", () => {
    // Recording that the venue's register took payment is the server's job at
    // the end of a round; reopening rewrites that assertion and stays with a
    // manager.
    expect(hasCapability("host_server", "tabs.settle")).toBe(true);
    expect(hasCapability("bar_kitchen", "tabs.settle")).toBe(true);
    expect(hasCapability("host_server", "tabs.reopen")).toBe(false);
    expect(hasCapability("bar_kitchen", "tabs.reopen")).toBe(false);
  });

  it("separates drafting a purchase order from approving one", () => {
    expect(hasCapability("inventory_operator", "purchasing.order.create")).toBe(true);
    expect(hasCapability("inventory_operator", "purchasing.receive")).toBe(true);
    // Approval commits the venue's money.
    expect(hasCapability("inventory_operator", "purchasing.order.approve")).toBe(false);
  });

  it("keeps pricing away from the floor while allowing other item edits", () => {
    // PRODUCT.md: ordinary staff may change other item details, but not tax
    // assignments or pricing policy.
    expect(hasCapability("bar_kitchen", "menu.edit")).toBe(true);
    expect(hasCapability("bar_kitchen", "menu.pricing")).toBe(false);
    expect(hasCapability("host_server", "menu.pricing")).toBe(false);
  });

  it("lets every role reach the Overview it lands on", () => {
    for (const role of STAFF_ROLES) {
      expect(hasCapability(role, "overview.view")).toBe(true);
    }
  });
});

describe("role management authority is separate from capabilities", () => {
  it("lets an owner manage anyone", () => {
    expect([...manageableRoles("owner")].sort()).toEqual([...STAFF_ROLES].sort());
  });

  it("stops a manager from creating an owner or a peer", () => {
    const allowed = manageableRoles("manager");
    expect(allowed).not.toContain("owner");
    expect(allowed).not.toContain("manager");
    expect([...allowed].sort()).toEqual([
      "bar_kitchen",
      "host_server",
      "inventory_operator",
    ]);
  });

  it("gives the operational roles no authority at all", () => {
    for (const role of ["host_server", "bar_kitchen", "inventory_operator"] as const) {
      expect(manageableRoles(role)).toEqual([]);
    }
    expect(manageableRoles("regional_director")).toEqual([]);
    expect(manageableRoles(null)).toEqual([]);
  });

  it("covers every role in the authority map", () => {
    for (const role of STAFF_ROLES) {
      expect(MANAGEABLE_ROLES[role]).toBeDefined();
    }
  });
});

describe("role labels", () => {
  it("names every role for an operator", () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(roleLabel(role)).toBe(ROLE_LABELS[role]);
    }
  });

  it("falls back to the raw value rather than rendering undefined", () => {
    expect(roleLabel("regional_director")).toBe("regional_director");
    expect(roleLabel(null)).toBe("No role");
  });
});
