import { cn } from "@/lib/utils"

/**
 * Loading.
 *
 * A skeleton mirrors **the exact row rhythm it replaces** — same row height,
 * same column positions, same number of rows — so the page does not reflow when
 * real data lands. A generic grey block is not a loading state; it is a
 * placeholder for one.
 *
 * 1.4s breathe (`--dur-breathe`), staggered 100ms down a list via `index`.
 */
function Skeleton({
  className,
  index = 0,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  /** Position in the list — staggers the breathe by 100ms per row. */
  index?: number
}) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "skeleton-breathe bg-muted rounded-[var(--radius-2)]",
        className
      )}
      style={{ animationDelay: `${index * 100}ms`, ...style }}
      {...props}
    />
  )
}

/**
 * A skeleton shaped like a data-table row: full desktop row height, hairline
 * separated, with cells at the widths the real table uses. Pass the same column
 * widths the table's `<colgroup>` uses.
 */
function SkeletonRow({
  columns,
  index = 0,
  className,
}: {
  /** Tailwind width classes, one per column of the table being replaced. */
  columns: string[]
  index?: number
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-[var(--row-desktop)] items-center gap-[var(--space-12)] border-b border-border px-[var(--space-12)]",
        className
      )}
      aria-hidden
    >
      {columns.map((width, column) => (
        <Skeleton
          key={column}
          index={index}
          className={cn("h-[1em]", width)}
        />
      ))}
    </div>
  )
}

/**
 * A run of `SkeletonRow`s, staggered.
 *
 * Still per-surface, not a generic block: the caller passes the column widths
 * of the table it is standing in for, so the placeholder has that surface's own
 * rhythm and the page does not reflow when the data lands.
 */
function SkeletonList({
  rows,
  columns,
  className,
}: {
  rows: number
  /** Tailwind width classes, one per column of the table being replaced. */
  columns: string[]
  className?: string
}) {
  return (
    <div className={className} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, row) => (
        <SkeletonRow key={row} columns={columns} index={row} />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonRow, SkeletonList }
