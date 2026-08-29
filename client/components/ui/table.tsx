"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import type { Severity } from "@/lib/severity"

/**
 * The data table — a ledger, not a card.
 *
 * Header is the Micro step (9.5 mono uppercase) over a strong rule. Rows are
 * 44px on desktop and 56px on tablet, separated by hairlines, with NO ZEBRA.
 * Text left, figures right and tabular. Hover lifts the background one step.
 * Selection is a 2px inset brand bar.
 *
 * Fixed column widths per screen, so numbers align down the page — set them at
 * the call site with a `<colgroup>` or explicit widths on `<TableHead>`.
 */

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    // Wide content scrolls inside its own container; the page never scrolls
    // horizontally.
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom border-collapse",
          "text-[length:var(--ui-size)] leading-[var(--ui-lh)]",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border-strong", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border-strong font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * `severity` tints the row. Per §02 this is allowed for CRITICAL and ATTEND
 * only, and the 2px inset bar is critical-only — attend never fills a whole
 * row background, so its tint is deliberately the faintest step rather than a
 * wash. Read the rank in `docs/DESIGN.md` before setting it, and always pair
 * the tint with a word in the row.
 */
function TableRow({
  className,
  severity = "neutral",
  ...props
}: React.ComponentProps<"tr"> & { severity?: Severity }) {
  return (
    <tr
      data-slot="table-row"
      data-severity={severity}
      className={cn(
        "border-b border-border transition-colors",
        "h-[var(--row-desktop)]",
        "hover:bg-accent",
        // Selection is a 2px inset brand bar, not a fill.
        "data-[state=selected]:shadow-[inset_2px_0_0_0_var(--primary)]",
        severity === "critical" &&
          "bg-critical-tint shadow-[inset_2px_0_0_0_var(--critical-fill)]",
        severity === "attend" && "bg-attend-tint",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // Micro step — table head is in-product only.
        "px-[var(--space-12)] text-left align-middle whitespace-nowrap",
        "font-mono uppercase font-medium text-muted-foreground",
        "text-[length:var(--micro-size)] leading-[var(--micro-lh)] tracking-[var(--micro-ls)]",
        "h-8 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

/** `numeric` puts the cell right and sets it in tabular mono, so figures align
 *  down the page. Format the value through the canonical helpers first. */
function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-[var(--space-12)] py-[var(--space-8)] align-middle",
        numeric &&
          "text-right font-mono tabular-nums text-[length:var(--data-size)]",
        "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        "text-muted-foreground mt-4 text-[length:var(--ui-size)]",
        className
      )}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
