"""Emit docs/permission-matrix.md: every route, its capability, and who holds it.

This is the review artifact for the stage-6 authorization change and the source
the route inventory test reads. Regenerate it whenever a route is added or a
guard changes:

    cd server && venv/bin/python scripts/generate_permission_matrix.py
"""

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.routing import APIRoute, APIWebSocketRoute  # noqa: E402

from app.core.permissions import (  # noqa: E402
    CAPABILITIES,
    ROLE_LABELS,
    ROLES,
    capabilities_for,
)
from app.routers import (  # noqa: E402
    analytics,
    auth,
    availability,
    booking_schedules,
    businesses,
    customers,
    floor_plan,
    insights,
    inventory,
    notifications,
    ordering,
    public_capabilities,
    public_privacy,
    purchasing,
    queue,
    reports,
    reservations,
    service_types,
    staff,
    tabs,
    tax,
)

MODULES = [
    ("analytics", analytics),
    ("auth", auth),
    ("availability", availability),
    ("booking_schedules", booking_schedules),
    ("businesses", businesses),
    ("customers", customers),
    ("floor_plan", floor_plan),
    ("insights", insights),
    ("inventory", inventory),
    ("notifications", notifications),
    ("ordering", ordering),
    ("public_capabilities", public_capabilities),
    ("public_privacy", public_privacy),
    ("purchasing", purchasing),
    ("queue", queue),
    ("reports", reports),
    ("reservations", reservations),
    ("service_types", service_types),
    ("staff", staff),
    ("tabs", tabs),
    ("tax", tax),
]

#: Authenticated routes that deliberately carry no capability, with the reason.
#: Anything not listed here and not public must name a capability, or the route
#: inventory test fails. Keep this list short and justified.
CAPABILITY_EXEMPT = {
    # Self-service account routes. They act on the caller's own user row, so a
    # role check would be meaningless — the boundary is "is this you".
    ("auth", "GET", "/api/auth/me"),
    ("auth", "PATCH", "/api/auth/me"),
    ("auth", "GET", "/api/auth/me/context"),
    ("auth", "POST", "/api/auth/change-email"),
    ("auth", "POST", "/api/auth/change-password"),
    ("auth", "POST", "/api/auth/disable-account"),
    ("auth", "POST", "/api/auth/delete-account"),
    ("auth", "POST", "/api/auth/ws-token"),
    # The caller's own notification inbox, scoped by user_id in the service.
    ("notifications", "GET", "/api/notifications"),
    ("notifications", "GET", "/api/notifications/"),
    ("notifications", "GET", "/api/notifications/unread-count"),
    ("notifications", "PATCH", "/api/notifications/{notification_id}/read"),
    ("notifications", "POST", "/api/notifications/read-all"),
    # Every role needs the business it is signed in to in order to render a page.
    ("businesses", "GET", "/api/businesses/current"),
}


def _flatten(dependant):
    """Every dependency callable reachable from a route, including router-level."""
    stack = [dependant]
    while stack:
        d = stack.pop()
        yield d
        stack.extend(d.dependencies)


def _guards(route) -> tuple[set[str], set[str], set[str]]:
    """(capabilities, modules, dependency names) guarding a route.

    `require_capability` and `require_module` are closures, so the guarded value
    is read out of the closure cell rather than from a registry — that keeps the
    generator honest about what the running app actually enforces.
    """
    caps: set[str] = set()
    modules: set[str] = set()
    names: set[str] = set()
    for dependency in _flatten(route.dependant):
        call = getattr(dependency, "call", None)
        if call is None:
            continue
        names.add(getattr(call, "__name__", ""))
        qualname = getattr(call, "__qualname__", "")
        for cell in getattr(call, "__closure__", None) or ():
            try:
                value = cell.cell_contents
            except ValueError:
                continue
            if qualname.startswith("require_capability") and value in CAPABILITIES:
                caps.add(value)
            elif qualname.startswith("require_module") and isinstance(value, str):
                modules.add(value)
            elif qualname.startswith("require_any_module") and isinstance(value, tuple):
                modules.update(v for v in value if isinstance(v, str))
    return caps, modules, names


def collect() -> list[dict]:
    rows: list[dict] = []
    for name, module in MODULES:
        routers = [
            getattr(module, attr)
            for attr in ("router", "ws_router")
            if hasattr(module, attr)
        ]
        for router in routers:
            for route in router.routes:
                if isinstance(route, APIWebSocketRoute):
                    # WebSocket auth is a first-frame token exchange in
                    # websocket_auth.py, not a FastAPI dependency.
                    rows.append(
                        {
                            "router": name,
                            "method": "WEBSOCKET",
                            "path": route.path,
                            "endpoint": route.name,
                            "capabilities": set(),
                            "modules": set(),
                            "public": False,
                            "exempt": True,
                            "note": "token frame",
                        }
                    )
                    continue
                if not isinstance(route, APIRoute):
                    continue
                caps, modules, names = _guards(route)
                authenticated = bool(
                    names & {"get_current_user", "get_current_business"}
                ) or bool(caps)
                for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
                    rows.append(
                        {
                            "router": name,
                            "method": method,
                            "path": route.path,
                            "endpoint": route.name,
                            "capabilities": caps,
                            "modules": modules,
                            "public": not authenticated,
                            "exempt": (name, method, route.path) in CAPABILITY_EXEMPT,
                            "note": "",
                        }
                    )
    return rows


def uncovered(rows: list[dict]) -> list[dict]:
    """Authenticated routes with no capability and no recorded exemption."""
    return [
        r
        for r in rows
        if not r["public"] and not r["exempt"] and not r["capabilities"]
    ]


def render(rows: list[dict]) -> str:
    lines: list[str] = []
    lines.append("# Route permission matrix")
    lines.append("")
    lines.append(
        "Generated by `server/scripts/generate_permission_matrix.py`. Do not edit "
        "by hand — change the route's guard or `server/app/core/permissions.py` "
        "and regenerate."
    )
    lines.append("")
    lines.append(
        "Every authenticated route names exactly one capability, except the "
        "self-service and session-context routes listed as _exempt_ in the "
        "generator. A **public** route is reachable without a staff session by "
        "design; its abuse controls are rate limits, signed guest capabilities "
        "and module gates rather than roles. "
        "`tests/integration/test_permission_matrix.py` fails when an "
        "authenticated route has neither a capability nor an exemption, so a new "
        "route cannot quietly default open."
    )
    lines.append("")

    lines.append("## Roles")
    lines.append("")
    lines.append("| Role | Operator label | Capabilities held |")
    lines.append("| --- | --- | ---: |")
    for role in ROLES:
        lines.append(
            f"| `{role}` | {ROLE_LABELS[role]} | {len(capabilities_for(role))} |"
        )
    lines.append("")

    lines.append("## Capability by role")
    lines.append("")
    lines.append("| Capability | " + " | ".join(f"`{r}`" for r in ROLES) + " |")
    lines.append("| --- | " + " | ".join(":-:" for _ in ROLES) + " |")
    for cap in CAPABILITIES:
        cells = ["●" if cap in capabilities_for(role) else "" for role in ROLES]
        lines.append(f"| `{cap}` | " + " | ".join(cells) + " |")
    lines.append("")

    lines.append("## Routes")
    lines.append("")
    by_router: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_router[row["router"]].append(row)

    for router_name in sorted(by_router):
        lines.append(f"### `{router_name}.py`")
        lines.append("")
        lines.append("| Method | Path | Capability | Module | Roles |")
        lines.append("| --- | --- | --- | --- | --- |")
        for row in sorted(
            by_router[router_name], key=lambda r: (r["path"], r["method"])
        ):
            if row["capabilities"]:
                caps = sorted(row["capabilities"])
                cap_cell = ", ".join(f"`{c}`" for c in caps)
                holders = [
                    r for r in ROLES if all(c in capabilities_for(r) for c in caps)
                ]
                roles_cell = ", ".join(holders) if holders else "—"
            elif row["public"]:
                cap_cell, roles_cell = "_public_", "anyone"
            elif row["note"]:
                cap_cell, roles_cell = f"_{row['note']}_", "any signed-in staff"
            elif row["exempt"]:
                cap_cell, roles_cell = "_self-service_", "the signed-in user"
            else:
                cap_cell, roles_cell = "**NONE**", "any signed-in staff"
            module_cell = ", ".join(sorted(row["modules"])) or "—"
            lines.append(
                f"| {row['method']} | `{row['path']}` | {cap_cell} "
                f"| {module_cell} | {roles_cell} |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    rows = collect()
    out = Path(__file__).resolve().parents[2] / "docs" / "permission-matrix.md"
    out.write_text(render(rows))
    print(f"{len(rows)} routes -> {out.relative_to(Path.cwd().parent)}")

    gaps = uncovered(rows)
    if gaps:
        print(f"\n{len(gaps)} authenticated routes carry no capability:")
        for r in gaps:
            print(f"  {r['router']:20s} {r['method']:9s} {r['path']}  ({r['endpoint']})")
        return 1
    print("Every authenticated route names a capability or a recorded exemption.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
