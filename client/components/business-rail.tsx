"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { clientGetQueueActiveCount } from "@/lib/client-api";
import { hasModule, type ModuleKey } from "@/lib/modules";
import { isNavItemActive, visibleNavGroups } from "@/lib/nav";
import { hasCapability, roleLabel, type Capability } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * The 228px rail — §05 of the Dashboard canvas.
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
export function BusinessRail() {
  const pathname = usePathname();
  const { user, meContext } = useAuth();
  const currentRole =
    meContext?.role ?? (user?.type === "staff" ? user.role : undefined);

  // Both gates fail closed while /me/context is loading. An entry that appears
  // and then vanishes is a control the API would have rejected anyway, and on a
  // disabled module it briefly shows a tenant something they have not bought.
  const can = (capability: Capability) =>
    meContext?.capabilities
      ? meContext.capabilities.includes(capability)
      : hasCapability(currentRole, capability);

  const moduleEnabled = (module: ModuleKey) =>
    meContext ? hasModule(meContext.enabledModules, module) : false;

  const groups = visibleNavGroups(moduleEnabled, can);
  const queueCount = useQueueCount(moduleEnabled("queue"));

  return (
    <aside className="sticky top-0 flex h-svh w-[var(--rail)] shrink-0 flex-col border-r border-border bg-sidebar">
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

      <RailIdentity
        name={user?.name ?? null}
        role={currentRole}
      />
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

/**
 * The one live count in the rail.
 *
 * The canvas also badges Tickets, Reservations and Inventory. No count endpoint
 * exists for those, and adding three more 30-second polls to every screen is a
 * change to how the app loads, not a presentation change. Recorded in
 * `docs/TODO.md` §7a.
 *
 * It is neutral, not critical. The canvas fills the Tickets badge with
 * `--critical-fill`, which under the rank means "a ticket is past its target" —
 * and no target is stored anywhere, so that fill cannot be earned.
 */
function useQueueCount(enabled: boolean): number | null {
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const businessId = user?.type === "staff" ? user.businessId : null;

  useEffect(() => {
    if (!enabled || !businessId) return;

    const refresh = () => {
      clientGetQueueActiveCount(businessId)
        .then(setCount)
        .catch(() => {});
    };

    refresh();
    timer.current = setInterval(refresh, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [enabled, businessId]);

  // Gated on read rather than cleared in the effect: a stale count must never
  // outlive the module being switched off, and clearing it in the effect body
  // is a cascading render for a value nobody is going to see.
  return enabled ? count : null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
