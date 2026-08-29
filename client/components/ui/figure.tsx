"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The operational figure — the thing a manager reads first.
 *
 * Four weights, per §06 of the System canvas:
 *   tablet   Archivo 800 / 66px — at arm's length in a dark room, this is the
 *            size that reads without looking. Two per screen, not four.
 *   headline Archivo 800 / 52–60px — the desktop figure band.
 *   panel    Archivo 700 / 22–30px — inside a panel.
 *   table    IBM Plex Mono 13.5 — in a row.
 *
 * Label above in the Label step, comparison below in mono.
 *
 * TWO RULES THAT ARE NOT STYLE:
 *
 * 1. A figure only takes colour when it is CRITICAL. A number being lower than
 *    someone hoped is never critical — a month-over-month decline is neutral,
 *    and rendering it red is the single most common way this rank gets abused.
 *    The one figure the design colours is median ticket age, because that is
 *    the number that means the night is going wrong.
 *
 * 2. An empty figure is an EM-DASH, never a zero. A zero is a claim about a
 *    night that has not happened. `value={null}` renders the dash.
 */

const figureSizes = {
  tablet: "text-[66px] leading-[0.94] tracking-[-0.038em] font-extrabold",
  /**
   * The figure band, at both targets: 66px at arm's length on a tablet, 52px
   * at a desk. One size that knows about the two screens the product is
   * designed for, so a band does not need a responsive class at every call
   * site — and so nobody invents a third size in between.
   */
  band: "text-[66px] leading-[0.94] tracking-[-0.038em] font-extrabold desktop:text-[52px] desktop:leading-[1] desktop:tracking-[-0.036em]",
  headline: "text-[52px] leading-[1] tracking-[-0.036em] font-extrabold",
  panel: "text-[26px] leading-[1.05] tracking-[-0.028em] font-bold",
  table: "font-mono text-[length:var(--data-size)] leading-[var(--data-lh)] font-normal",
} as const

export interface FigureProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The Label step, above the figure. */
  label?: React.ReactNode
  /**
   * The formatted figure. Pass `null` or `undefined` for "nothing has happened
   * yet" — it renders an em-dash in the dimmest ink, never a zero. Format it
   * through the canonical helpers (`formatMoney`, `formatBusinessTime`) with
   * the tenant's regional settings; never a raw number or a locale literal.
   */
  value?: React.ReactNode
  /**
   * Set half-size and dimmed AFTER the digits, German style: `4.318,00 €`.
   * Pass the symbol only — the digits belong in `value`.
   */
  unit?: React.ReactNode
  /** Below the figure, in mono. A comparison, a rate, a breakdown. */
  comparison?: React.ReactNode
  size?: keyof typeof figureSizes
  /**
   * Only ever `true` for a genuine critical: a time-critical service failure
   * happening now. Read the rank in `docs/DESIGN.md` before setting it.
   */
  critical?: boolean
}

function Figure({
  label,
  value,
  unit,
  comparison,
  size = "panel",
  critical = false,
  className,
  ...props
}: FigureProps) {
  const isEmpty = value === null || value === undefined || value === ""

  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      {label ? (
        <span className="font-mono uppercase text-muted-foreground text-[length:var(--label-size)] leading-[var(--label-lh)] tracking-[var(--label-ls)]">
          {label}
        </span>
      ) : null}

      <span
        className={cn(
          "font-display tabular-nums",
          figureSizes[size],
          isEmpty
            ? "text-text-on-ink-faint"
            : critical
              ? "text-critical-text"
              : "text-foreground"
        )}
      >
        {isEmpty ? (
          // Not a zero. A zero is a claim about a night that has not happened.
          <span aria-label="No value yet">—</span>
        ) : (
          <>
            {value}
            {unit ? (
              <span className="ml-1 text-[0.5em] font-normal text-muted-foreground align-baseline">
                {unit}
              </span>
            ) : null}
          </>
        )}
      </span>

      {comparison ? (
        <span className="font-mono text-muted-foreground text-[length:var(--micro-size)] leading-[1.35] tracking-[0.02em]">
          {comparison}
        </span>
      ) : null}
    </div>
  )
}

export { Figure, figureSizes }
