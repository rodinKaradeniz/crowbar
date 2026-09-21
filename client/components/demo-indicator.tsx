import Link from "next/link";

import { IS_DEMO } from "@/lib/demo/mode";

/**
 * Always on screen in the demo build, and absent from every other build.
 *
 * Neutral on purpose: being a demo is not a severity, and a coloured band
 * would teach visitors that this tone means something it does not. The word
 * carries it. What it says is what a visitor could otherwise get wrong — the
 * evening is a recording, and what they change is kept in this browser and
 * nowhere else.
 */
export function DemoIndicator() {
  if (!IS_DEMO) return null;

  return (
    <div
      role="note"
      aria-label="Demo"
      // A row that does not fit wraps; it does not squeeze. Without this the
      // two actions hold their width and the sentence beside them folds into a
      // column, which cost a phone a third of its screen before anything on
      // the page had been read. `--row-content-min` is the width the sentence
      // keeps before the actions drop to their own line.
      className="flex w-full flex-wrap items-center gap-x-[var(--space-12)] gap-y-[var(--space-8)] border-b border-border bg-secondary px-[var(--space-16)] py-[var(--space-8)] text-secondary-foreground"
    >
      <span className="shrink-0 font-mono font-semibold uppercase text-[length:var(--label-size)] tracking-[var(--label-ls)]">
        Demo
      </span>
      <span className="min-w-[var(--row-content-min)] flex-1 text-[length:var(--ui-size)] leading-[var(--ui-lh)]">
        A recorded evening. What you change stays in this browser.
      </span>
      <form action="/api/demo/reset" method="post" className="shrink-0">
        <button
          type="submit"
          className="border-b border-border-strong text-[length:var(--ui-size)] font-semibold"
        >
          Start the evening again
        </button>
      </form>
      <Link
        href="/auth/login"
        className="shrink-0 border-b border-border-strong text-[length:var(--ui-size)] font-semibold"
      >
        Switch role
      </Link>
    </div>
  );
}
