"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { DashboardHeaderTrailing } from "@/components/dashboard-header-trailing";
import { DashboardSearch } from "@/components/dashboard-search";
import { Button } from "@/components/ui/button";
import { useServiceClock } from "@/hooks/use-service-clock";
import { useRegionalSettings } from "@/contexts/regional-context";
import {
  formatBusinessServiceDay,
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
 */
export function BusinessTopbar({
  businessName,
  docsAssistantEnabled,
  canSeatWalkIn,
}: {
  businessName: string;
  docsAssistantEnabled: boolean;
  /** Desktop only — on tablet this action moves to the bottom-right corner. */
  canSeatWalkIn: boolean;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

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

      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 border-b border-border bg-[var(--scrim-ink)] px-[clamp(16px,2.5vw,32px)] py-3.5 backdrop-blur-[8px]">
        <div className="min-w-0">
          <h1 className="type-t1 mb-[3px] truncate">{businessName}</h1>
          <ServiceClock />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-6">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-[var(--control-desktop)] w-[min(280px,44vw)] items-center gap-2 rounded-[var(--radius-3)] border border-border bg-sidebar px-3 text-left text-[length:var(--ui-size)] text-muted-foreground transition-colors hover:border-border-strong"
          >
            <span className="flex-1 truncate">Find a guest, table or item</span>
            {/* The shortcut hint is desktop-only: a tablet has no ⌘. */}
            <span className="type-micro hidden shrink-0 rounded-[var(--radius-2)] border border-border px-1.5 py-0.5 tracking-[0.06em] desktop:inline">
              ⌘K
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <DashboardHeaderTrailing
              variant="business"
              docsAssistantEnabled={docsAssistantEnabled}
            />
          </div>

          {/* Desktop only. On a tablet this lives in the bottom-right corner,
              where the hand already is — see TabletPrimaryAction. */}
          {canSeatWalkIn ? (
            <Button asChild className="hidden desktop:inline-flex">
              <Link href="/business/queue">Seat a walk-in</Link>
            </Button>
          ) : null}
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
        {formatBusinessServiceDay(now, timezone, locale)} ·{" "}
        {formatBusinessTime(now, timezone, locale)}
      </span>
    </p>
  );
}
