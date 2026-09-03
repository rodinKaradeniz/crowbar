import type { ModuleKey } from "@/lib/modules";
import type { Capability } from "@/lib/permissions";

/**
 * The workspace navigation, as data.
 *
 * Three groups — Service, Setup, Business — matching §05 of the Dashboard
 * canvas.
 *
 * THE GROUPS COLLAPSE. Sixteen entries dumped at once is a list nobody reads;
 * the groups are now disclosures, and the group holding the current route has
 * no toggle at all so the active item can never be hidden.
 *
 * `children` supports a page that is genuinely PART OF another rather than a
 * peer of it, and is deliberately one level deep. Nothing uses it today: its
 * one holder was a schedule page nested under Menu, and a menu now carries its
 * own activation windows, so that schedule lives on the menu it governs.
 *
 * THE GATES ARE THE POINT. An item renders only when its module is on AND the
 * role holds its capability. **A disabled module's entry is removed, not
 * greyed** (States board 03) — no dead entries teasing what cannot be opened
 * mid-rush, and no greyed item that sends someone to a settings page they
 * cannot use.
 *
 * Keeping this as data rather than 500 lines of JSX means the gate for a screen
 * is stated once, next to its route, and the same list can drive a tablet
 * bottom bar in Phase 6 without being rewritten.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Off means the entry is not rendered at all. */
  module?: ModuleKey;
  /** The role must hold this to see the entry. */
  capability?: Capability;
  /** Any of these modules being on is enough — the floor serves three. */
  anyModule?: ModuleKey[];
  /** Matches child routes too, for `Settings` and `Inventory`. */
  matchPrefix?: boolean;
  /** Which live count, if any, this entry carries. */
  badge?: "queue";
  /**
   * Entries that are a part of this one rather than a peer of it. One level
   * only: a second would be a different navigation, not a deeper one.
   */
  children?: NavItem[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Service",
    items: [
      { href: "/business/overview", label: "Overview", capability: "overview.view" },
      {
        href: "/business/floor",
        label: "Floor map",
        capability: "floor.view",
        anyModule: ["reservations", "queue", "ordering"],
      },
      {
        href: "/business/orders",
        label: "Tickets",
        module: "ordering",
        capability: "orders.view",
      },
      {
        href: "/business/tabs",
        label: "Tabs",
        module: "ordering",
        capability: "tabs.view",
      },
      {
        href: "/business/reservations",
        label: "Reservations",
        module: "reservations",
        capability: "reservations.view",
      },
      {
        href: "/business/requests",
        label: "Requests",
        module: "reservations",
        capability: "reservations.manage",
      },
      {
        href: "/business/queue",
        label: "Walk-in queue",
        module: "queue",
        capability: "queue.view",
        badge: "queue",
      },
    ],
  },
  {
    label: "Setup",
    items: [
      {
        href: "/business/menu",
        label: "Menu",
        module: "ordering",
        capability: "menu.view",
      },
      {
        href: "/business/inventory",
        label: "Inventory",
        module: "inventory",
        capability: "inventory.view",
        matchPrefix: true,
      },
      {
        href: "/business/schedule",
        label: "Schedule",
        module: "reservations",
        capability: "reservations.manage",
      },
      {
        href: "/business/customers",
        label: "Guests",
        capability: "customers.view",
      },
    ],
  },
  {
    label: "Business",
    items: [
      {
        href: "/business/reports",
        label: "Reports",
        capability: "reports.service",
        matchPrefix: true,
      },
      {
        href: "/business/insights",
        label: "Insights",
        module: "insights",
        capability: "insights.view",
      },
      { href: "/business/staff", label: "Staff", capability: "staff.view" },
      {
        href: "/business/profile/info",
        label: "Venue",
        capability: "business.configure",
        matchPrefix: true,
      },
    ],
  },
];

/** `/business/profile/info` must match the whole `/business/profile` branch. */
export function navHrefPrefix(item: NavItem): string {
  if (item.href.startsWith("/business/profile")) return "/business/profile";
  if (item.href.startsWith("/business/settings")) return "/business/settings";
  return item.href;
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.matchPrefix) return pathname.startsWith(navHrefPrefix(item));
  return pathname === item.href;
}

/**
 * Filters the model down to what this operator may actually open.
 *
 * `moduleEnabled` and `hasCapability` both FAIL CLOSED while context is still
 * loading. The old sidebar defaulted modules to "show everything", which
 * flashed entries a disabled tenant must never see; an item that appears and
 * then vanishes is a control the API would have rejected anyway.
 */
export function visibleNavGroups(
  moduleEnabled: (module: ModuleKey) => boolean,
  can: (capability: Capability) => boolean,
): NavGroup[] {
  const allowed = (item: NavItem): boolean => {
    if (item.module && !moduleEnabled(item.module)) return false;
    if (item.anyModule && !item.anyModule.some(moduleEnabled)) return false;
    if (item.capability && !can(item.capability)) return false;
    return true;
  };

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(allowed).map((item) => {
      // Children pass the same gates as their parent, independently: a role
      // that may open Menu does not necessarily hold `menu.edit`. An empty
      // `children` is dropped rather than left as an empty disclosure.
      if (!item.children) return item;
      const children = item.children.filter(allowed);
      return children.length > 0 ? { ...item, children } : { ...item, children: undefined };
    }),
  })).filter((group) => group.items.length > 0);
}

/** Every entry a group renders, parents and children, in visual order. */
export function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ?? [])]);
}
