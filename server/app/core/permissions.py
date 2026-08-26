"""
The fixed MVP permission matrix.

Crowbar's pilot venue staffs five operational roles. This module maps each role
to the capabilities it holds, and every protected route asks for a capability
rather than naming roles. Call sites therefore state intent ("may approve a
purchase order") instead of membership ("owner or manager"), and there is one
place to audit when a role's reach changes.

This is deliberately **not** a permission engine. The map is hard-coded, resolved
at import time, and cannot be edited by a tenant, an admin UI, or configuration.
`docs/TODO.md` defers a tenant-configurable RBAC module to post-MVP; if you find
yourself building a screen that assigns capabilities to roles, you have left the
stage.

`client/lib/permissions.ts` mirrors this map for the frontend. The server is the
authority; the mirror exists only so ordinary staff never see a control the API
will reject. `tests/unit/test_permissions.py` asserts the two stay identical.
"""

from types import MappingProxyType


# ─── Roles ───────────────────────────────────────────────────────────────────

OWNER = "owner"
MANAGER = "manager"
HOST_SERVER = "host_server"
BAR_KITCHEN = "bar_kitchen"
INVENTORY_OPERATOR = "inventory_operator"

#: Every role the `ck_staff_role` constraint (migration 049) permits.
ROLES: tuple[str, ...] = (
    OWNER,
    MANAGER,
    HOST_SERVER,
    BAR_KITCHEN,
    INVENTORY_OPERATOR,
)

#: Operator-facing role names. The staff UI renders these; the database stores
#: the slug above.
ROLE_LABELS: MappingProxyType = MappingProxyType(
    {
        OWNER: "Owner",
        MANAGER: "Manager",
        HOST_SERVER: "Host / server",
        BAR_KITCHEN: "Bar / kitchen",
        INVENTORY_OPERATOR: "Inventory operator",
    }
)


# ─── Capabilities ────────────────────────────────────────────────────────────
# Grouped by the workflow they belong to. A capability is a stable string; a
# route names one. Adding a capability means adding it to every role that should
# hold it below — an unlisted capability is held by nobody except the owner.

CAPABILITIES: tuple[str, ...] = (
    # The Overview page every role lands on. Its money figure is gated
    # separately on `reports.service` inside the route.
    "overview.view",
    # Reservations
    "reservations.view",
    "reservations.manage",
    "reservations.override",
    "reservations.configure",
    # Queue
    "queue.view",
    "queue.manage",
    "queue.configure",
    # Floor
    "floor.view",
    "floor.operate",
    "floor.configure",
    # Ordering
    "orders.view",
    "orders.take",
    "orders.fulfill",
    "menu.view",
    "menu.edit",
    "menu.configure",
    "menu.pricing",
    "stations.configure",
    "happyhour.manage",
    # Tabs and external settlement
    "tabs.view",
    "tabs.operate",
    "tabs.settle",
    "tabs.reopen",
    # Inventory
    "inventory.view",
    "inventory.movements",
    "inventory.items.manage",
    "inventory.counts.walk",
    "inventory.counts.manage",
    "inventory.cost.view",
    # Purchasing
    "purchasing.view",
    "purchasing.suppliers.manage",
    "purchasing.order.create",
    "purchasing.order.approve",
    "purchasing.receive",
    # Guest CRM
    "customers.view",
    "customers.manage",
    "customers.privacy",
    # Reporting
    "reports.service",
    "reports.cost",
    "reports.staff_actions",
    # Optional ML dashboard
    "insights.view",
    "insights.run",
    # Business administration
    "staff.view",
    "staff.manage",
    "business.configure",
    "business.delete",
    "business.onboarding",
)


# ─── The matrix ──────────────────────────────────────────────────────────────

_MANAGER_CAPABILITIES = frozenset(
    c for c in CAPABILITIES if c not in {"business.delete", "business.onboarding"}
)

#: A host or server works the front of house: takes and changes bookings, runs
#: the queue, seats and closes tables, takes and delivers orders, opens and
#: settles tabs, and keeps guest context current. They do not configure the
#: venue, see cost figures, or touch stock.
_HOST_SERVER_CAPABILITIES = frozenset(
    {
        "overview.view",
        "reservations.view",
        "reservations.manage",
        "queue.view",
        "queue.manage",
        "floor.view",
        "floor.operate",
        "orders.view",
        "orders.take",
        "orders.fulfill",
        "menu.view",
        "menu.edit",
        "tabs.view",
        "tabs.operate",
        "tabs.settle",
        "customers.view",
        "customers.manage",
    }
)

#: A bartender or cook works the pass: sees what is booked and waiting, takes and
#: fulfills orders, runs bar tabs, 86s an item, and posts the spillage and
#: breakage they cause. They do not seat guests, change bookings, or edit prices.
_BAR_KITCHEN_CAPABILITIES = frozenset(
    {
        "overview.view",
        "reservations.view",
        "queue.view",
        "floor.view",
        "orders.view",
        "orders.take",
        "orders.fulfill",
        "menu.view",
        "menu.edit",
        "tabs.view",
        "tabs.operate",
        "tabs.settle",
        "inventory.view",
        "inventory.movements",
        "inventory.counts.walk",
        "customers.view",
    }
)

#: An inventory operator owns the stockroom: items and packs, counts start to
#: reconciliation, suppliers, drafting orders and receiving deliveries. Approving
#: an order commits the venue's money, so that stays managerial, and so do the
#: cost and margin figures derived from their work.
_INVENTORY_OPERATOR_CAPABILITIES = frozenset(
    {
        "overview.view",
        "menu.view",
        "inventory.view",
        "inventory.movements",
        "inventory.items.manage",
        "inventory.counts.walk",
        "inventory.counts.manage",
        "purchasing.view",
        "purchasing.suppliers.manage",
        "purchasing.order.create",
        "purchasing.receive",
    }
)

ROLE_CAPABILITIES: MappingProxyType = MappingProxyType(
    {
        OWNER: frozenset(CAPABILITIES),
        MANAGER: _MANAGER_CAPABILITIES,
        HOST_SERVER: _HOST_SERVER_CAPABILITIES,
        BAR_KITCHEN: _BAR_KITCHEN_CAPABILITIES,
        INVENTORY_OPERATOR: _INVENTORY_OPERATOR_CAPABILITIES,
    }
)


# ─── Role management authority ───────────────────────────────────────────────
# Separate from capabilities: holding `staff.manage` says you may open the Staff
# page, not that you may create another owner. An owner manages anyone; a manager
# manages only the three operational roles, so a manager can neither promote
# anyone to their own level nor edit a peer.

_MANAGEABLE_BY_MANAGER = frozenset({HOST_SERVER, BAR_KITCHEN, INVENTORY_OPERATOR})

ROLE_MANAGEMENT_AUTHORITY: MappingProxyType = MappingProxyType(
    {
        OWNER: frozenset(ROLES),
        MANAGER: _MANAGEABLE_BY_MANAGER,
        HOST_SERVER: frozenset(),
        BAR_KITCHEN: frozenset(),
        INVENTORY_OPERATOR: frozenset(),
    }
)


# ─── Lookups ─────────────────────────────────────────────────────────────────


def capabilities_for(role: str | None) -> frozenset[str]:
    """Every capability a role holds. An unknown or missing role holds none."""
    if role is None:
        return frozenset()
    return ROLE_CAPABILITIES.get(role, frozenset())


def has_capability(role: str | None, capability: str) -> bool:
    """Whether `role` may perform `capability`.

    Fails closed on an unknown role, which is what makes a future sixth role
    safe to add to the database before it is added here.
    """
    return capability in capabilities_for(role)


def manageable_roles(actor_role: str | None) -> frozenset[str]:
    """The roles `actor_role` may assign, edit, invite, or remove."""
    if actor_role is None:
        return frozenset()
    return ROLE_MANAGEMENT_AUTHORITY.get(actor_role, frozenset())


def _assert_matrix_is_well_formed() -> None:
    """Catch a typo in the map at import time rather than at a 403."""
    known = set(CAPABILITIES)
    for role, granted in ROLE_CAPABILITIES.items():
        unknown = granted - known
        if unknown:
            raise ValueError(
                f"Role '{role}' grants unknown capabilities: {sorted(unknown)}"
            )
    if set(ROLE_CAPABILITIES) != set(ROLES):
        raise ValueError("ROLE_CAPABILITIES must cover exactly the roles in ROLES")
    if set(ROLE_MANAGEMENT_AUTHORITY) != set(ROLES):
        raise ValueError(
            "ROLE_MANAGEMENT_AUTHORITY must cover exactly the roles in ROLES"
        )


_assert_matrix_is_well_formed()
