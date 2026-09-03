"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BusinessMobileNav } from "@/components/business-mobile-nav";
import { DashboardHeaderTrailing } from "@/components/dashboard-header-trailing";
import { DashboardSearch } from "@/components/dashboard-search";
import { Button } from "@/components/ui/button";
import type { NavGroup } from "@/lib/nav";
import { useServiceClock } from "@/hooks/use-service-clock";
import { useRegionalSettings } from "@/contexts/regional-context";
import {
  formatBusinessServiceDayLong,
  formatBusinessTime,
} from "@/lib/business-time";

/**
 * The workspace header — §05 of the Dashboard canvas.
 *
 * Venue name at T1, the service day and the venue's own clock beneath it,
 * search, and one primary action.
 *
 * NO LIVE INDICATOR. The canvas puts "Live · synced 2 s ago" here. The shell
 * holds no socket — the four that exist belong to the floor, tickets, tabs and
 * queue boards — and a header claiming a connection it is not watching is
 * exactly the failure the offline bar exists to prevent. The live mark stays on
 * the boards that actually have one. Recorded in `docs/TODO.md` §7a.
 *
 * The clock IS real, and worth its space: it runs in the venue's configured
 * timezone, which is not necessarily the timezone of the laptop behind the bar.
 *
 * ONE LINE BELOW --bp-phone. The bar used to wrap onto two: a 280px search
 * field, a bell and a 44px action beside a venue name will not sit on 390px,
 * and `flex-wrap` resolved that by stacking them under the name. So on a phone
 * the header holds exactly what a header is for — where you are, and the way to
 * everywhere else — and search, notifications and the whole navigation move
 * into `BusinessMobileNav`. `flex-nowrap` there is the guard that keeps it
 * honest: nothing can quietly wrap back.
 *
 * The search FIELD survives at tablet and desktop, placeholder and ⌘K hint
 * intact; only the phone gets the bare magnifying glass, because only the phone
 * cannot afford the field.
 */
export function BusinessTopbar({
  businessName,
  canSeatWalkIn,
  groups,
  queueCount,
}: {
  businessName: string;
  /** Desktop only — on tablet this action moves to the bottom-right corner. */
  canSeatWalkIn: boolean;
  /** Phone only: the nav sheet's entries, from the one shared `useWorkspaceNav`. */
  groups: NavGroup[];
  queueCount: number | null;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Referentially stable: NotificationTrigger reports the count from an effect
  // keyed on it, and a fresh function each render would re-run that effect.
  const onUnreadChange = useCallback((count: number) => setUnread(count), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <DashboardSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        variant="business"
      />

      <BusinessMobileNav
        open={navOpen}
        onOpenChange={setNavOpen}
        groups={groups}
        queueCount={queueCount}
        unreadCount={unread}
        // Close the menu FIRST. Both panels are sheets, and a sheet opened over
        // another sheet leaves two scrims and two focus traps stacked.
        onOpenSearch={() => {
          setNavOpen(false);
          setSearchOpen(true);
        }}
        onOpenNotifications={() => {
          setNavOpen(false);
          setNotificationsOpen(true);
        }}
      />

      {/* `min-h`, not `h`: a floor, the same way the marketing header bar is a
          floor. The value is declared because it is also a SCROLL OFFSET — a
          sticky sibling that does not know how tall this bar is ends up
          underneath it. See --workspace-header and the Schedule calendar. */}
      <header className="sticky top-0 z-20 flex min-h-[var(--workspace-header)] flex-nowrap items-center gap-4 border-b border-border bg-[var(--scrim-ink)] px-[clamp(16px,2.5vw,32px)] py-3.5 backdrop-blur-[8px] phone:flex-wrap">
        <div className="min-w-0">
          <h1 className="type-t1 mb-[3px] truncate">{businessName}</h1>
          <ServiceClock />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 phone:flex-wrap phone:gap-6">
          {/* The field on tablet and desktop; the bare glass on a phone. One
              control either way — same handler, same panel, same shortcut. */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="hidden h-[var(--control-desktop)] w-[min(280px,44vw)] items-center gap-2 rounded-[var(--radius-3)] border border-border bg-sidebar px-3 text-left text-[length:var(--ui-size)] text-muted-foreground transition-colors hover:border-border-strong phone:flex"
          >
            <span className="flex-1 truncate">Find a guest, table or item</span>
            {/* The shortcut hint is desktop-only: a tablet has no ⌘. */}
            <span className="type-micro hidden shrink-0 rounded-[var(--radius-2)] border border-border px-1.5 py-0.5 tracking-[0.06em] desktop:inline">
              ⌘K
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <DashboardHeaderTrailing
              notificationsOpen={notificationsOpen}
              onNotificationsOpenChange={setNotificationsOpen}
              onUnreadChange={onUnreadChange}
            />
          </div>

          {/* Desktop only. On a tablet this lives in the bottom-right corner,
              where the hand already is — see TabletPrimaryAction. */}
          {canSeatWalkIn ? (
            <Button asChild className="hidden desktop:inline-flex">
              <Link href="/business/queue">Seat a walk-in</Link>
            </Button>
          ) : null}

          {/* Phone only. The unread count rides on this button because the bell
              it normally sits on is not rendered at this width — see
              NotificationTrigger's `onUnreadChange`. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0 phone:hidden"
            aria-label={`Menu${unread > 0 ? `, ${unread} unread notifications` : ""}`}
            aria-haspopup="dialog"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <Menu className="size-5" />
            {unread > 0 ? (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-primary-foreground"
                aria-hidden
              >
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Button>
        </div>
      </header>
    </>
  );
}

/**
 * The service day and the venue's clock, ticking.
 *
 * Renders nothing on the server: the venue's local time is not knowable at
 * build or on a cached render, and a stale clock behind the bar is worse than a
 * blank one for the half-second before hydration.
 *
 * IT KEEPS TICKING, on the 30s cadence of `useServiceClock`. This is the
 * VENUE'S time in the venue's configured timezone, not the device's — the
 * laptop behind the bar may be set to anything — so a clock frozen at page load
 * would quietly misreport it for the rest of a shift on a screen nobody
 * reloads. One text node every 30 seconds is the cheapest thing on this page.
 *
 * Weekday and month are spelled out. This line has a whole row to itself, so
 * there is nothing to be gained by abbreviating them, and "Di." is a worse read
 * at a glance than "Dienstag".
 */
function ServiceClock() {
  const { locale, timezone } = useRegionalSettings();
  const { now, ready } = useServiceClock();

  if (!ready) {
    return <p className="type-label h-[1.2em] text-text-on-ink-faint" />;
  }

  return (
    <p className="type-label flex items-center gap-3 text-text-on-ink-faint">
      <span>
        {formatBusinessServiceDayLong(now, timezone, locale)} ·{" "}
        {formatBusinessTime(now, timezone, locale)}
      </span>
    </p>
  );
}
