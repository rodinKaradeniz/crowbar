"use client";

import { BookOpen, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Identity } from "@/components/account-menu";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { flattenNavItems, isNavItemActive, type NavGroup } from "@/lib/nav";
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
 * TABLET, AND ONLY TABLET: `hidden phone:flex desktop:hidden`. Both arguments
 * above are arguments about a tablet. On a 390px phone the five slots are 78px
 * each — under the 48px touch floor once a badge is in one — and the bottom
 * edge is where the browser's own chrome sits. The phone gets a sheet behind a
 * menu button instead; see `BusinessMobileNav`.
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
  const { user, meContext } = useAuth();
  const currentRole =
    meContext?.role ?? (user?.type === "staff" ? user.role : undefined);

  const all = groups.flatMap((group) => flattenNavItems(group.items));
  const primary = SERVICE_ORDER.map((href) =>
    all.find((item) => item.href === href),
  ).filter((item) => item !== undefined);

  // "Everything else" is flat on purpose. The sheet is already a disclosure —
  // nesting a second one inside it would be two taps to reach one page on the
  // device where taps are most expensive. The child keeps its own full label
  // ("Happy hour windows"), which is what makes it readable without the parent
  // above it.
  const rest = groups
    .map((group) => ({
      ...group,
      items: flattenNavItems(group.items).filter(
        (item) => !SERVICE_ORDER.includes(item.href),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 hidden h-[var(--bottom-nav)] border-t border-border-strong bg-sidebar phone:flex desktop:hidden"
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

          {/* Identity, the two account destinations and the way out.

              The tablet range had NO sign-out at all: the rail that carried it
              is `desktop:flex`, so between --bp-phone and --bp-desktop there
              was no way for an operator to leave a workspace on a shared
              device. Settings and Docs join it here because they left the
              navigation groups above — see components/account-menu.tsx. */}
          <div className="shrink-0 border-t border-border p-4">
            {user?.name ? (
              <div className="mb-2 flex items-center gap-2.5">
                <Identity name={user.name} role={currentRole} />
              </div>
            ) : null}

            <Link
              href="/business/settings/profile"
              onClick={() => setMoreOpen(false)}
              className="flex min-h-[var(--control-tablet-min)] items-center gap-2.5 rounded-[var(--radius-3)] px-2 text-[length:var(--ui-size)] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Settings aria-hidden className="size-4 shrink-0" /> Settings
            </Link>
            <Link
              href="/business/docs"
              onClick={() => setMoreOpen(false)}
              className="flex min-h-[var(--control-tablet-min)] items-center gap-2.5 rounded-[var(--radius-3)] px-2 text-[length:var(--ui-size)] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <BookOpen aria-hidden className="size-4 shrink-0" /> Docs
            </Link>
            <SignOutButton className="min-h-[var(--control-tablet-min)] w-full px-2" />
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
 * A phone hides it too: it is positioned against `--bottom-nav`, and that bar
 * is not rendered below `--bp-phone` — so it would float over the last row of
 * the content rather than clear of a bar that is not there.
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
    <div className="fixed right-5 bottom-[calc(var(--bottom-nav)+20px)] z-30 hidden phone:block desktop:hidden">
      <Button asChild size="tablet" className="h-[60px] px-[26px] text-[16.5px] shadow-e1">
        <Link href={href}>{children}</Link>
      </Button>
    </div>
  );
}
