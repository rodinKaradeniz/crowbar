"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { isNavItemActive, type NavGroup } from "@/lib/nav";
import { roleLabel } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * The 228px rail — §05 of the Dashboard canvas. Desktop only; below
 * `--bp-desktop` the bottom bar takes over.
 *
 * Text only. No icons: the badge is the only status object in the system, and a
 * second visual language in the nav would be a second one. Active is a raised
 * surface with a 2px inset brand bar, which is the same "you are here" mark the
 * data table uses for a selected row.
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
        {groups.map((group, groupIndex) => (
          <div
            key={group.label}
            className={groupIndex === 0 ? "px-3 pt-4 pb-2" : "px-3 pt-3 pb-2"}
          >
            {/* `muted-foreground` resolves to the on-ink family here. The canvas
                uses --text-muted, a PAPER token that measures 3.12:1 on this
                surface and misses the system's own "AA for small text
                everywhere" floor. Recorded in docs/TODO.md §7b. */}
            <p className="type-micro mb-2 ml-1.5 text-muted-foreground">
              {group.label}
            </p>

            <div className="flex flex-col gap-px">
              {group.items.map((item) => {
                const active = isNavItemActive(item, pathname);
                return (
                  <Link
                    key={item.href}
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
                      // Neutral: a queue with people in it is the normal state
                      // of a busy night, not something to act on now.
                      <Badge className="ml-auto" tone="neutral">
                        {queueCount > 99 ? "99+" : queueCount}
                      </Badge>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <RailIdentity name={user?.name ?? null} role={currentRole} />
    </aside>
  );
}

/** Who is signed in, at the foot — the last thing, furthest from the actions. */
function RailIdentity({
  name,
  role,
}: {
  name: string | null;
  role: string | null | undefined;
}) {
  if (!name) return null;

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-border p-3.5">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-surface-raised font-mono text-[11px] font-semibold text-text-on-ink-2">
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="type-micro block text-muted-foreground">
          {roleLabel(role)}
        </span>
      </span>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
