import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The ONLY status object in the system.
 *
 * One geometry, three fills — mono 10px, 2px radius, 2/7 padding, tabular
 * figures. There is no second form anywhere in the product: no dots in nav, no
 * coloured pills, no icon badges, no bespoke status chip.
 *
 * The badge carries a count or a two-word state; the FILL carries the worst
 * severity inside whatever it is counting. Picking a tone is not a style
 * choice — run the test in `docs/DESIGN.md`: *what does a bartender do about
 * it, and when?*
 *
 *   critical  act now, this shift. Exhaustively: a ticket past its target
 *             time, a guest waiting past the time they were quoted, a live
 *             board that has lost its connection, a device that cannot send
 *             orders, a thing that is broken right now.
 *   attend    before the night ends, not in the next two minutes.
 *   neutral   THE DEFAULT. Par levels, ordering, forecasts, variance, counts,
 *             comparisons — anything whose deadline is a day away. Reads
 *             through weight and position, and gets no hue.
 *
 * Stock, money, next week, or a number being lower than someone hoped is never
 * critical. Par levels and ordering are never attend. If a state does not
 * clearly qualify, it is neutral.
 *
 * A severity colour is never the sole carrier of meaning — always pair the
 * tone with a word.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center justify-center shrink-0 border",
    "font-mono uppercase font-semibold tabular-nums",
    "text-[length:var(--label-size)] leading-[var(--label-lh)] tracking-[0.1em]",
    "rounded-[var(--radius-2)] px-[7px] py-[2px] min-w-[34px]",
  ],
  {
    variants: {
      tone: {
        neutral: "border-border-strong text-foreground bg-transparent",
        attend: "border-transparent bg-attend-fill text-attend-on-fill",
        critical: "border-transparent bg-critical-fill text-critical-on-fill",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>

function Badge({ className, tone, ...props }: BadgeProps) {
  const resolved = tone

  return (
    <div
      data-slot="badge"
      data-tone={resolved ?? "neutral"}
      className={cn(badgeVariants({ tone: resolved }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
