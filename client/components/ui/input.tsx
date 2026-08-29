import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 48px on auth, 40px in the product. Radius 3, 13px inset.
 *
 * The label is 10.5 mono uppercase ABOVE the field — never a floating
 * placeholder. Use `<Label>`, which is already set to that step.
 *
 * Focus is a deep-green border plus a 3px lit-green ring (55% on paper, 24% on
 * ink — `--focus-ring-paper` / `--focus-ring-ink`, resolved by `--ring`).
 *
 * Invalid uses `--field-invalid`, which is a FORM STATE and not a severity
 * rank. "Too short — 10 characters minimum" is this; it never borrows a
 * severity token, because a password-length hint is not a service item to be
 * handled before the night ends. The token resolves per ground —
 * `--field-invalid` on paper, `--field-invalid-ink` on ink and surface — so a
 * field error is legible on a dark settings panel and still does not read as
 * a service alarm next to `--critical-text-ink`.
 *
 * Pair `aria-invalid` with a message that says what to do next.
 */
const inputSizes = {
  /** Product default. */
  default: "h-10",
  /** Auth and marketing — one-handed, in the dark. */
  auth: "h-12",
  /** Every control on a tablet surface clears --control-tablet-min. */
  tablet: "h-[var(--control-tablet-min)]",
} as const

function Input({
  className,
  type,
  inputSize = "default",
  ...props
}: React.ComponentProps<"input"> & { inputSize?: keyof typeof inputSizes }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 border bg-input-background text-foreground",
        "border-input rounded-[var(--radius-3)] px-[13px]",
        "font-sans text-[length:var(--ui-size)] leading-[var(--ui-lh)]",
        "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
        "outline-none transition-colors",
        "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring",
        "aria-invalid:border-field-invalid aria-invalid:ring-[3px] aria-invalid:ring-[var(--field-invalid-ring)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        inputSizes[inputSize],
        className
      )}
      {...props}
    />
  )
}

export { Input }
