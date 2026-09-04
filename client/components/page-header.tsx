"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/**
 * The identity of a workspace page, pinned under the topbar.
 *
 * WHY IT IS PINNED. A staff screen is read while something else is happening —
 * a guest at the door, a ticket going cold. Scroll far enough into Inventory
 * and the only thing on screen is a table of rows that could belong to any
 * page in the product. Keeping the title, the description and the sub-tabs in
 * view means the answer to "where am I, and what else is here" is never a
 * scroll away.
 *
 * `top` IS `--workspace-header`, NOT ZERO. The topbar is `sticky top-0` and 76
 * tall, so anything else that sticks at 0 sticks *underneath* it and loses its
 * first 76px — silently, and only once the page is long enough to scroll. That
 * was live on four surfaces before this component existed: the docs nav, the
 * floor aside, and both profile/settings preview columns. The token is the one
 * number they now all read.
 *
 * MEASURE IS A PROPERTY OF THE PAGE, NOT OF THE HEADER. `--grid-workspace`
 * caps a document page — settings, profile, menu, staff, docs — because a
 * 1900px-wide text input is not a form anyone wants to fill in. A board —
 * floor, tickets, tabs, reservations, queue, overview — passes `wide` and
 * takes the whole screen, because width there is the working surface. The
 * header has to know which it is so its own content lines up with the body
 * beneath it rather than floating off to one side.
 *
 * IT PUBLISHES ITS OWN HEIGHT as `--page-header`, because it is now a second
 * scroll offset and its height is not a constant: a page with sub-tabs is
 * taller than one without, actions wrap on a narrow screen, and a description
 * can run to two lines. Anything else on the page that sticks — the schedule
 * and floor asides, the profile preview column — offsets by
 * `calc(var(--workspace-header) + var(--page-header))` and therefore lands
 * under this bar rather than behind it. A hard-coded number would be wrong on
 * the first page that added a tab.
 *
 * `children` IS THE SUB-NAVIGATION SLOT. Where a page branches — Inventory's
 * Stock/Counts/Suppliers, Reports, Insights — the `TabsList` belongs here, so
 * the branch you are on stays visible with the title that owns it. Radix needs
 * `TabsList` and `TabsContent` under one `Tabs` root, so on those pages `Tabs`
 * wraps the header and the body together.
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
  above,
  wide = false,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Page-level controls — the ones that act on the whole screen. */
  actions?: React.ReactNode;
  /** Sub-navigation: a `TabsList`, a search field, a filter row. */
  children?: React.ReactNode;
  /** A back link or eyebrow, above the title. */
  above?: React.ReactNode;
  /** Board pages: run to the full width instead of the document measure. */
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Layout effect, not effect: the offset has to be right on the first paint,
  // or a sticky sibling jumps once after hydration.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    // offsetHeight, not contentRect: this bar has padding and a bottom border,
    // and a sibling clearing it has to clear the whole box.
    const publish = () =>
      root.style.setProperty("--page-header", `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--page-header");
    };
  }, []);

  return (
    <div
      ref={ref}
      // Chrome, for printing purposes. The only print stylesheet in the product
      // is the table QR sheet's, and a page's own pinned title bar — with its
      // actions, including the Print button itself — is exactly the furniture a
      // printed sheet must not carry. See the @media print block in globals.css.
      data-print-hide
      className={cn(
        "sticky top-[var(--workspace-header)] z-10 border-b border-border",
        // OPAQUE, unlike the topbar above it. The topbar's `--scrim-ink` is
        // 94% and frosted, which works over the ~76px it covers; this bar can
        // be 236px on Reports, and at that height the 6% that gets through is
        // legible as ghost text behind the title. `--background` on the ink
        // ground is the same rgb(20,20,15) at full opacity, so the two bars
        // still read as one pinned region.
        "bg-background",
        "px-[clamp(16px,2.5vw,32px)] py-[var(--space-16)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-[var(--space-16)]",
          !wide && "mx-auto w-full max-w-[var(--grid-workspace)]",
        )}
      >
        <div className="flex flex-wrap items-start gap-[var(--space-16)]">
          <div className="min-w-0 flex-1">
            {above}
            <h1 className="type-t1 truncate">{title}</h1>
            {description ? (
              <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
        {children ? (
          // The sub-navigation scrolls sideways rather than widening the page.
          // A five-entry `TabsList` is `w-fit` and measures 593px, so on a
          // 390px phone it pushed the whole document to 609 and every screen
          // scrolled horizontally. `-my-1 py-1` gives the focus ring room:
          // setting overflow on one axis computes the other to `auto`, so a
          // ring on a trigger would otherwise be clipped top and bottom.
          <div className="-my-1 min-w-0 overflow-x-auto py-1">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The scrolling half of a page, under its `PageHeader`.
 *
 * It carries the same gutter and the same measure so the body lines up with
 * the title above it. Separate components rather than one wrapper because the
 * two have to be siblings: a `position: sticky` element only sticks within its
 * own parent's box, so a header nested inside the scrolling body would stop
 * sticking the moment that body scrolled past.
 */
export function PageBody({
  children,
  wide = false,
  className,
}: {
  children: React.ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className="px-[clamp(16px,2.5vw,32px)] py-[var(--space-24)]">
      <div
        className={cn(
          "flex flex-col gap-[var(--space-24)]",
          !wide && "mx-auto w-full max-w-[var(--grid-workspace)]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
