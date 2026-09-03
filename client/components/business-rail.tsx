"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";

import { AccountMenu } from "@/components/account-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { flattenNavItems, isNavItemActive, type NavGroup, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * Which groups this operator has closed. Per browser, per person.
 *
 * Read through `useSyncExternalStore` rather than an effect. The server, and
 * the client's hydration render, both use `EVERY_GROUP_OPEN`; React then
 * re-renders with what storage actually holds. That is the supported way to
 * read a browser-only value without the two trees disagreeing — and this rail
 * is not the place to introduce a hydration mismatch, given the pass it landed
 * in fixed one.
 */
const COLLAPSED_KEY = "crowbar-nav-collapsed";

/** Frozen, and shared: `getServerSnapshot` must be referentially stable. */
const EVERY_GROUP_OPEN: readonly string[] = Object.freeze([]);

/** Last parse, kept so `getSnapshot` returns the same array between renders. */
let snapshot: { raw: string | null; value: readonly string[] } = {
  raw: null,
  value: EVERY_GROUP_OPEN,
};

const COLLAPSED_CHANGED = "crowbar:nav-collapsed";

function getCollapsedSnapshot(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(COLLAPSED_KEY);
  } catch {
    // A private window, cleared site data, or storage the browser refuses to
    // hand over. The rail opens fully, which is the safe answer.
    return EVERY_GROUP_OPEN;
  }
  if (raw !== snapshot.raw) {
    let value: readonly string[] = EVERY_GROUP_OPEN;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        value = parsed.filter((entry): entry is string => typeof entry === "string");
      }
    } catch {
      // Someone else wrote nonsense under our key. Open everything.
    }
    snapshot = { raw, value };
  }
  return snapshot.value;
}

function getCollapsedServerSnapshot(): readonly string[] {
  return EVERY_GROUP_OPEN;
}

function subscribeCollapsed(onChange: () => void): () => void {
  // `storage` covers the operator's other tabs; the custom event covers this
  // one, which `storage` deliberately does not fire for.
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSED_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSED_CHANGED, onChange);
  };
}

function writeCollapsed(next: string[]): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
  } catch {
    // Storage refused. Nothing is persisted and the rail stays as it is —
    // better than a rail that appears to remember and does not.
    return;
  }
  window.dispatchEvent(new Event(COLLAPSED_CHANGED));
}

/**
 * The 228px rail — §05 of the Dashboard canvas. Desktop only; below
 * `--bp-desktop` the bottom bar takes over.
 *
 * No ICONS ON ITEMS: the badge is the only status object in the system, and a
 * second visual language beside the labels would be a second one. The group
 * caret is not that — it is an affordance on a control, not a mark on a piece
 * of data, and `aria-expanded` is what actually carries the state.
 *
 * Active is a raised surface with a 2px inset brand bar, which is the same
 * "you are here" mark the data table uses for a selected row.
 *
 * GROUPS COLLAPSE. Sixteen entries at once is a list nobody reads. Two rules
 * keep it safe rather than clever:
 *
 *   - The group holding the current route renders NO TOGGLE AT ALL. Not a
 *     disabled one — a disabled button drops out of the tab order and gives an
 *     operator a control that silently refuses. There is simply nothing to
 *     press, and the active item cannot be hidden.
 *   - The stored state is applied in an effect, never read during render.
 *     Reading localStorage while rendering makes the server and client trees
 *     disagree, which is the hydration bug this same pass fixed in Tabs.
 *
 * Nothing animates open. The system declares no height motion, and inventing
 * one for a menu is exactly the kind of undeclared easing rule zero exists to
 * stop.
 *
 * WHAT IS NOT HERE, AND WHY. The canvas puts "Close the night" in the rail
 * foot, diagonally opposite "Seat a walk-in". No service-day close action
 * exists anywhere in `server/app/`, so it is not built — a button that ends a
 * shift must do what it says. Recorded in `docs/TODO.md` §7a.
 */
export function BusinessRail({
  groups,
  queueCount,
}: {
  groups: NavGroup[];
  queueCount: number | null;
}) {
  const pathname = usePathname();
  const { user, meContext } = useAuth();
  const currentRole =
    meContext?.role ?? (user?.type === "staff" ? user.role : undefined);

  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot,
  );

  const toggleGroup = (label: string) => {
    writeCollapsed(
      collapsed.includes(label)
        ? collapsed.filter((entry) => entry !== label)
        : [...collapsed, label],
    );
  };

  return (
    <aside className="sticky top-0 hidden h-svh w-[var(--rail)] shrink-0 flex-col border-r border-border bg-sidebar desktop:flex">
      <div className="flex shrink-0 items-center gap-[9px] border-b border-border px-[18px] pt-[18px] pb-4">
        <span className="mkt-logo-mark block bg-primary" aria-hidden />
        <span className="font-display text-[17px] font-extrabold tracking-[-0.035em]">
          CROWBAR
        </span>
      </div>

      {/* Only the nav scrolls. The identity block stays pinned to the foot —
          a long nav must not push who-is-signed-in off the bottom. */}
      <nav className="flex flex-1 flex-col overflow-y-auto pb-2" aria-label="Workspace">
        {groups.map((group, groupIndex) => {
          // The group you are standing in is pinned open and has no toggle.
          const holdsCurrent = flattenNavItems(group.items).some((item) =>
            isNavItemActive(item, pathname),
          );
          const open = holdsCurrent || !collapsed.includes(group.label);
          const panelId = `rail-group-${group.label.toLowerCase().replace(/\W+/g, "-")}`;

          return (
            <div
              key={group.label}
              className={groupIndex === 0 ? "px-3 pt-4 pb-2" : "px-3 pt-3 pb-2"}
            >
              {/* `muted-foreground` resolves to the on-ink family here. The
                  canvas uses --text-muted, a PAPER token that measures 3.12:1 on
                  this surface and misses the system's own "AA for small text
                  everywhere" floor. Recorded in docs/TODO.md §7b. */}
              {holdsCurrent ? (
                <p className="type-micro mb-2 ml-1.5 flex min-h-[var(--control-desktop-min)] items-center text-muted-foreground">
                  {group.label}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className={cn(
                    "type-micro mb-2 flex w-full min-h-[var(--control-desktop-min)] items-center gap-2",
                    "rounded-[var(--radius-3)] px-1.5 text-left text-muted-foreground",
                    "transition-colors hover:bg-secondary hover:text-foreground",
                  )}
                >
                  {group.label}
                  <ChevronDown
                    aria-hidden
                    className={cn("ml-auto size-3.5", !open && "-rotate-90")}
                  />
                </button>
              )}

              <div id={panelId} hidden={!open} className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <RailItem
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    queueCount={queueCount}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <RailIdentity name={user?.name ?? null} role={currentRole} />
    </aside>
  );
}

/**
 * One entry, and any entry that belongs to it.
 *
 * A child is indented behind a hairline rather than hidden behind a second
 * disclosure: there is exactly one of them in the whole navigation, and a
 * one-item accordion is a control that costs more than it saves.
 */
function RailItem({
  item,
  pathname,
  queueCount,
  nested = false,
}: {
  item: NavItem;
  pathname: string;
  queueCount: number | null;
  nested?: boolean;
}) {
  const active = isNavItemActive(item, pathname);

  return (
    <>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-[var(--radius-3)] p-2.5",
          "text-[length:var(--ui-size)] transition-colors",
          active
            ? "bg-accent font-semibold text-foreground shadow-[inset_2px_0_0_var(--primary)]"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        {item.label}
        {item.badge === "queue" && queueCount ? (
          // Neutral: a queue with people in it is the normal state of a busy
          // night, not something to act on now.
          <Badge className="ml-auto" tone="neutral">
            {queueCount > 99 ? "99+" : queueCount}
          </Badge>
        ) : null}
      </Link>

      {item.children?.length && !nested ? (
        <div className="ml-2.5 flex flex-col gap-px border-l border-border pl-1.5">
          {item.children.map((child) => (
            <RailItem
              key={child.href}
              item={child}
              pathname={pathname}
              queueCount={queueCount}
              nested
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * Who is signed in, at the foot — the last thing, furthest from the actions.
 *
 * And, beneath it, the way out. Sign out belongs with the identity it ends
 * rather than in the nav above: it is not a place you can go. It is also the
 * furthest control in the rail from "Seat a walk-in", which is the rule the
 * system already applies to shift-ending actions.
 *
 * It renders only WITH a name. Without one there is nobody to sign out — the
 * rail is waiting on `/me`, and a sign-out button on a session that has not
 * resolved is a control whose effect nobody can predict.
 */
/**
 * The foot of the rail: who is signed in, and the menu behind them.
 *
 * It was a static block with a sign-out button under it. Settings and Docs now
 * live in the menu it opens — see `components/account-menu.tsx` for why those
 * two left the navigation.
 */
function RailIdentity({
  name,
  role,
}: {
  name: string | null;
  role: string | null | undefined;
}) {
  if (!name) return null;

  return (
    <div className="shrink-0 border-t border-border p-3.5">
      <AccountMenu name={name} role={role} />
    </div>
  );
}
