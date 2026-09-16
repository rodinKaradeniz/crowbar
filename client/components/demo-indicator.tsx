import Link from "next/link";

import { IS_DEMO } from "@/lib/demo/mode";

/**
 * Always on screen in the demo build, and absent from every other build.
 *
 * Neutral on purpose: being a demo is not a severity, and a coloured band
 * would teach visitors that this tone means something it does not. The word
 * carries it. What it says is what a visitor could otherwise get wrong —
 * nothing is kept, and the boards are a still picture.
 */
export function DemoIndicator() {
  if (!IS_DEMO) return null;

  return (
    <div
      role="note"
      aria-label="Demo"
      className="flex w-full items-center gap-[var(--space-12)] border-b border-border bg-secondary px-[var(--space-16)] py-[var(--space-8)] text-secondary-foreground"
    >
      <span className="shrink-0 font-mono font-semibold uppercase text-[length:var(--label-size)] tracking-[var(--label-ls)]">
        Demo
      </span>
      <span className="min-w-0 flex-1 text-[length:var(--ui-size)] leading-[var(--ui-lh)]">
        A sample evening. Changes are not kept, and boards do not update live.
      </span>
      <Link
        href="/auth/login"
        className="shrink-0 border-b border-border-strong text-[length:var(--ui-size)] font-semibold"
      >
        Switch role
      </Link>
    </div>
  );
}
