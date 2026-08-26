"""Emit client/lib/permissions.ts from the Python permission matrix.

The frontend mirror is generated rather than hand-copied so the two cannot drift
in a way a reviewer has to notice. Regenerate after changing
`app/core/permissions.py`:

    cd server && venv/bin/python scripts/generate_permission_mirror.py

`client/tests/unit/permissions.test.ts` fails if the checked-in file is stale.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.permissions import (  # noqa: E402
    CAPABILITIES,
    ROLE_LABELS,
    ROLE_MANAGEMENT_AUTHORITY,
    ROLES,
    capabilities_for,
)

HEADER = '''// Mirror of `server/app/core/permissions.py`.
//
// The server is the authority: every protected route re-checks the capability
// and returns 403 regardless of what this file says. This mirror exists so an
// ordinary staff member never *sees* a control the API would reject, and so
// server components can gate a whole page before rendering it.
//
// Generated from the Python module. Regenerate after changing the matrix:
//   cd server && venv/bin/python scripts/generate_permission_mirror.py
// `client/tests/unit/permissions.test.ts` fails if the two drift.
'''

FOOTER = '''
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
'''


def _q(value: str) -> str:
    return f'"{value}"'


def render() -> str:
    lines: list[str] = [HEADER]

    lines.append("export const STAFF_ROLES = [")
    lines.extend(f"  {_q(r)}," for r in ROLES)
    lines.append("] as const;")
    lines.append("")
    lines.append("export type StaffRole = (typeof STAFF_ROLES)[number];")
    lines.append("")

    lines.append("export const CAPABILITIES = [")
    lines.extend(f"  {_q(c)}," for c in CAPABILITIES)
    lines.append("] as const;")
    lines.append("")
    lines.append("export type Capability = (typeof CAPABILITIES)[number];")
    lines.append("")

    lines.append("/** Operator-facing role names. The database stores the slug. */")
    lines.append("export const ROLE_LABELS: Record<StaffRole, string> = {")
    lines.extend(f"  {r}: {_q(ROLE_LABELS[r])}," for r in ROLES)
    lines.append("};")
    lines.append("")

    lines.append("const ROLE_CAPABILITIES: Record<StaffRole, readonly Capability[]> = {")
    for role in ROLES:
        lines.append(f"  {role}: [")
        lines.extend(f"    {_q(c)}," for c in sorted(capabilities_for(role)))
        lines.append("  ],")
    lines.append("};")
    lines.append("")

    lines.append("/** Roles this actor may invite, edit, or remove. Mirrors")
    lines.append(" * `ROLE_MANAGEMENT_AUTHORITY` — holding `staff.manage` opens the Staff")
    lines.append(" * page, it does not say which roles you may hand out. */")
    lines.append("export const MANAGEABLE_ROLES: Record<StaffRole, readonly StaffRole[]> = {")
    for role in ROLES:
        allowed = [r for r in ROLES if r in ROLE_MANAGEMENT_AUTHORITY[role]]
        lines.append(f"  {role}: [{', '.join(_q(a) for a in allowed)}],")
    lines.append("};")

    lines.append(FOOTER)
    return "\n".join(lines)


def main() -> int:
    out = Path(__file__).resolve().parents[2] / "client" / "lib" / "permissions.ts"
    out.write_text(render())
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
