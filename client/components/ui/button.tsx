import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * ONE primary signature everywhere in the product: the accent fills it — deep
 * green with paper text on paper, lit green with ink text on ink. That is what
 * `--primary` / `--primary-foreground` resolve to per ground, so `primary`
 * needs no ground-specific classes. Ink-black is never a primary button; it is
 * the page.
 *
 * Radius 3, and a 1px border ALWAYS, so the silhouette survives on both
 * grounds.
 *
 * SEVERITY DESCRIBES THE ITEM, NEVER THE CONTROL THAT RESOLVES IT. A late
 * ticket gets a red rail, a red badge and a red timer — and a standard primary
 * "Served". `destructive` is critical-filled and belongs only inside a dialog
 * or on a critical surface; putting it on a routine row control is a defect,
 * not a style preference.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0",
    "border rounded-[var(--radius-3)] font-sans font-medium",
    "text-[length:var(--ui-size)] leading-[var(--ui-lh)]",
    "transition-colors",
    // Disabled is FLAT — no border contrast, no fill, no hover (§06). A
    // translucent primary still reads as the primary action and invites the
    // click; this reads as "not yet".
    "disabled:pointer-events-none disabled:bg-control-disabled",
    "disabled:text-control-disabled-foreground disabled:border-border",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-1",
    "aria-invalid:border-field-invalid",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground border-primary hover:bg-primary-hover hover:border-primary-hover",
        /** Transparent with a hairline that darkens on hover. */
        secondary:
          "bg-transparent text-foreground border-border hover:border-border-strong hover:bg-accent",
        /** Quiet — no border until hover. Not a third signature, a demotion. */
        ghost:
          "bg-transparent text-foreground border-transparent hover:bg-accent",
        /** Dialogs and critical surfaces only. Never a routine control. */
        destructive:
          "bg-critical-fill text-critical-on-fill border-critical-fill hover:opacity-90",
        /** The risky choice in a dialog: a quiet outline in red text. */
        "destructive-quiet":
          "bg-transparent text-critical-text border-border hover:border-critical-text",
        link: "bg-transparent border-transparent text-primary underline-offset-4 hover:underline",
      },
      /**
       * The height ladder. Tablet is a hard floor, not a preference:
       * --control-tablet-min is 48px and every control on a tablet surface
       * must clear it.
       */
      size: {
        auth: "h-[50px] px-6",      // auth + marketing
        tablet: "h-[var(--control-tablet-min)] px-5",
        default: "h-[var(--control-desktop)] px-4", // 44 — desktop primary
        /**
         * 40 — guest CTAs (`Book Now`, `View Cart`, `Place Order`, queue join)
         * and the landing header. This step used to be the one literal in the
         * ladder (`h-10`), so the `width < 1280px` takeover that lifts every
         * other step to --control-tablet-min skipped it and it measured 40x40
         * at 1024, under the floor. Reading --control-md instead is the whole
         * fix: the same rule that moves `default` now moves this, 40 stays 40
         * at 1280+, and the phone-only override it needed is gone.
         */
        md: "h-[var(--control-md)] px-4",
        filter: "h-[var(--control-desktop-min)] px-3 gap-1.5", // 34
        icon: "size-[var(--control-desktop)]",
        /** Same 40 as `md`, and it was the same literal (`size-10`). */
        "icon-md": "size-[var(--control-md)]",
        "icon-sm": "size-[var(--control-desktop-min)]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

/** Defaults a missing variant to `primary`. Exported for the few places that
 *  call `buttonVariants()` directly rather than rendering <Button>. */
function resolveButtonVariant(
  variant: ButtonVariant | null | undefined
): ButtonVariant {
  return variant ?? "primary"
}

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  const resolvedVariant = resolveButtonVariant(variant)
  const resolvedSize = size

  return (
    <Comp
      data-slot="button"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      className={cn(
        buttonVariants({ variant: resolvedVariant, size: resolvedSize, className })
      )}
      {...props}
    />
  )
}

export { Button, buttonVariants, resolveButtonVariant }
export type { ButtonVariant, ButtonSize }
