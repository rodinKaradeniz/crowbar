"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { isNavItemActive, type NavGroup } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** The bar has five slots across 1024px; two labels are shortened to fit. */
const BAR_LABELS: Record<string, string> = {
  "/business/floor": "Floor",
  "/business/queue": "Queue",
};

const SERVICE_ORDER = [
  "/business/overview",
  "/business/floor",
  "/business/orders",
  "/business/queue",
];

/**
 * The tablet navigation — §07 of the Tablet canvas.
 *
 * A 76px bar along the bottom, not a 228px rail down the side. Two reasons,
 * both physical: a tablet is held, so the reachable part of the screen is the
 * bottom, and a rail costs 228px of a 1024px-wide room you need for the room.
 *
 * Four service screens plus More. The four are fixed — Overview, Floor,
 * Tickets, Queue — because muscle memory in the dark is worth more than
 * adapting the bar to whoever is signed in. Anything the role cannot open is
 * simply absent, same rule as the rail; everything else lives behind More.
 */
export function BusinessBottomBar({
  groups,
  queueCount,
}: {
  groups: NavGroup[];
  queueCount: number | null;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const all = groups.flatMap((group) => group.items);
  const primary = SERVICE_ORDER.map((href) =>
    all.find((item) => item.href === href),
  ).filter((item) => item !== undefined);

  const rest = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !SERVICE_ORDER.includes(item.href),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-[var(--bottom-nav)] border-t border-border-strong bg-sidebar desktop:hidden"
        aria-label="Workspace"
      >
        {primary.map((item, index) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 text-[15px] transition-colors",
                index > 0 && "border-l border-border",
                active
                  ? "border-t-2 border-t-primary bg-accent font-semibold text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {BAR_LABELS[item.href] ?? item.label}
              {item.badge === "queue" && queueCount ? (
                <Badge tone="neutral">{queueCount > 99 ? "99+" : queueCount}</Badge>
              ) : null}
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="w-32 shrink-0 border-l border-border text-[15px] text-muted-foreground"
        >
          More
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="right" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Everything else</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4">
            {rest.map((group) => (
              <div key={group.label} className="mb-6 last:mb-0">
                <p className="type-micro mb-2 text-muted-foreground">
                  {group.label}
                </p>
                <div className="flex flex-col">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex min-h-[var(--control-tablet-min)] items-center border-b border-border px-1 text-[15px]",
                        isNavItemActive(item, pathname)
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * The one primary action, in the arc of a right thumb.
 *
 * 20px from the bottom-right corner and clear of the bottom bar — §07 puts the
 * screen's primary action there on every tablet screen, because that is where
 * the hand already is. It is the one place in the system that carries E1
 * without being an overlay: it floats over the room it acts on.
 *
 * Desktop keeps its action in the header, so this hides above the breakpoint.
 *
 * IT IS NOT ON EVERY SCREEN. The canvas floats it over a read-only feed; on a
 * data table it would sit permanently on top of one row's Edit and Cancel
 * buttons, which is a control you cannot reach rather than one you can. It
 * renders only where the corner is free — see `TABLET_ACTION_ROUTES`.
 */
export function TabletPrimaryAction({
  href,
  children,
  show,
}: {
  href: string;
  children: React.ReactNode;
  /** False on screens whose bottom-right corner holds row controls. */
  show: boolean;
}) {
  if (!show) return null;

  return (
    <div className="fixed right-5 bottom-[calc(var(--bottom-nav)+20px)] z-30 desktop:hidden">
      <Button asChild size="tablet" className="h-[60px] px-[26px] text-[16.5px] shadow-e1">
        <Link href={href}>{children}</Link>
      </Button>
    </div>
  );
}
