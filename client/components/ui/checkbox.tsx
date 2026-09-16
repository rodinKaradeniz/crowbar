"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * THE ROOT IS THE TARGET; the drawn box is 16px and stays 16px.
 *
 * Radix renders a real `<button role="checkbox">`, so a `size-4` Root made the
 * hit target 16x16 — a third of the 48px floor every other control on a tablet
 * surface clears, and the smallest thing on the screen for someone tapping it
 * while holding a tray. An `::after` overlay would not have fixed it either:
 * the element's own box is what a pointer and an audit both measure, and a
 * pseudo-element does not change it.
 *
 * So the Root carries --control-desktop-min (34 → 48 under the takeover) and is
 * transparent, and the bordered square that reads as "the checkbox" is an inner
 * element at the size it always was. Nothing about the drawn control changes;
 * only the area that accepts a tap does.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer group/checkbox grid size-[var(--control-desktop-min)] shrink-0 place-content-center",
        "rounded-[var(--radius-3)] outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {/* The drawn box. Sized and styled exactly as the Root used to be. */}
      <span
        data-slot="checkbox-box"
        aria-hidden
        className={cn(
          // --radius-3 is the inputs/buttons/tiles step. This was `rounded-[4px]`,
          // a literal the token block never declared — carried in from shadcn and
          // only noticed because this line is being rewritten anyway.
          "border-input grid size-4 place-content-center rounded-[var(--radius-3)] border shadow-xs",
          "transition-shadow",
          "group-data-[state=checked]/checkbox:bg-primary",
          "group-data-[state=checked]/checkbox:text-primary-foreground",
          "group-data-[state=checked]/checkbox:border-primary",
          "group-focus-visible/checkbox:border-ring",
          "group-aria-invalid/checkbox:border-destructive"
        )}
      >
        <CheckboxPrimitive.Indicator
          data-slot="checkbox-indicator"
          className="grid place-content-center text-current transition-none"
        >
          <CheckIcon className="size-3.5" />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
