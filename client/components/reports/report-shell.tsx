"use client";

import { Download, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Figure } from "@/components/ui/figure";
import { Skeleton } from "@/components/ui/skeleton";
import { RangeCaption, type ReportRange } from "@/components/reports/report-range";

/**
 * The frame every report panel renders inside.
 *
 * It exists to make three things impossible to forget, because each of them is
 * a way a report can quietly mislead:
 *
 * 1. **The range.** A figure without its window is the defect the fixed-period
 *    analytics surfaces had.
 * 2. **Incompleteness.** When a service says `complete: false` it also says
 *    why, and that reason is rendered next to the number rather than dropped.
 *    Stage 5 set this rule: a UI may not render a cost figure without also
 *    rendering its incompleteness.
 * 3. **The disclosure.** Rendered verbatim from the server, never paraphrased.
 *
 * Ruled, not carded. This panel used to be a `border bg-card` box
 * with its own local `Figure` at `text-2xl`; it is now flat structure at
 * radius 0, and the figure is the shared primitive so an empty one is an
 * em-dash on every surface rather than only on the ones that remembered.
 */
interface Props {
  title: string;
  description: string;
  range: ReportRange;
  loading: boolean;
  error: string | null;
  complete?: boolean;
  incompleteReason?: string | null;
  disclosure?: string;
  onExport?: () => void;
  exportLabel?: string;
  /** Retry the panel's own load. A failed report always offers a way back. */
  onRetry?: () => void;
  /** Rows the skeleton should mirror while loading. */
  skeletonRows?: number;
  children: React.ReactNode;
}

export function ReportShell({
  title,
  description,
  range,
  loading,
  error,
  complete = true,
  incompleteReason,
  disclosure,
  onExport,
  exportLabel = "Export CSV",
  onRetry,
  skeletonRows = 4,
  children,
}: Props) {
  return (
    <section className="flex flex-col gap-[var(--space-16)]">
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-12)]">
        <div>
          <h2 className="type-t2">{title}</h2>
          <p className="text-[length:var(--ui-size)] text-muted-foreground">
            {description}
          </p>
          <RangeCaption range={range} />
        </div>
        {onExport && (
          <Button type="button" size="filter" variant="secondary" onClick={onExport}>
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {exportLabel}
          </Button>
        )}
      </div>

      {error ? (
        // A failed load is "a thing that is broken right now" — critical, and
        // always with a route out.
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-[var(--space-12)] border-l-2 border-critical-fill bg-critical-tint p-[var(--space-16)]"
        >
          <p className="text-[length:var(--ui-size)] text-critical-text">{error}</p>
          {onRetry && (
            <Button type="button" size="filter" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      ) : loading ? (
        <ReportSkeleton rows={skeletonRows} />
      ) : (
        <>
          {!complete && incompleteReason && (
            <div className="flex gap-[var(--space-8)] border-l-2 border-border-strong bg-secondary p-[var(--space-12)] text-[length:var(--ui-size)]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{incompleteReason}</p>
            </div>
          )}
          {children}
          {disclosure && (
            <p className="text-[length:var(--ui-size)] text-muted-foreground">
              {disclosure}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Mirrors the figure band and the rows it is about to become, so the panel
 * does not reflow when the report lands. Not a generic grey block.
 */
function ReportSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-[var(--space-24)]">
      <FigureBand>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-[var(--space-8)]">
            <Skeleton className="h-[var(--label-size)] w-20" index={i} />
            <Skeleton className="h-[26px] w-24" index={i} />
          </div>
        ))}
      </FigureBand>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex h-[var(--row-desktop)] items-center border-b border-border"
          >
            <Skeleton className="h-[1em] w-full max-w-[34%]" index={i} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The figure band: four across at a desk, **two** at arm's length on a tablet.
 * §07 is explicit that a tablet band is two, because a 66px figure that has to
 * share a row with three others stops being readable across a room.
 */
export function FigureBand({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-[var(--space-24)] desktop:grid-cols-4">
      {children}
    </div>
  );
}

/**
 * One headline number, on the shared primitive.
 *
 * `value` is `null` when the figure could not be computed. `Figure` renders an
 * em-dash for that — never a zero, because "no bookings" and "no no-shows"
 * must not look the same.
 */
export function ReportFigure({
  label,
  value,
  hint,
  unavailableHint = "Not enough data in this range",
}: {
  label: string;
  value: string | number | null | undefined;
  hint?: string;
  unavailableHint?: string;
}) {
  const missing = value === null || value === undefined;
  return (
    <Figure
      label={label}
      value={missing ? null : value}
      size="panel"
      comparison={missing ? unavailableHint : hint}
    />
  );
}
