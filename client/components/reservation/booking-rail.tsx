"use client";

import { cn } from "@/lib/utils";

/**
 * Where the guest is in the booking, and the way back to anything they have
 * already answered.
 *
 * THIS WAS AN ACCORDION FIRST, AND IT WAS MEASURED OUT. Every step listed down
 * the column with the current one expanded is the better shape on paper — the
 * decisions stay on screen and correcting one costs a click. It does not fit.
 * At 1280x800 the expanded steps measured 911, 852 and 1003px against a 752px
 * budget, and three collapsed rungs cost 171px of that on every screen. The
 * rail below is 24px and carries the same information.
 *
 * NOT A `Badge`, NOT A DOT. The badge is the only status object in the system
 * (docs/DESIGN.md §Components) and it carries a count or a two-word state, not
 * a step number. Colour is not the sole carrier either: the rung is announced
 * by its accessible label, the position is stated in words underneath, and the
 * step's own heading names where the guest is.
 *
 * A rung is a real `<button>` only where it goes somewhere — an answered step
 * behind the current one. A step that cannot be opened is not rendered as a
 * dead control.
 */
export function BookingRail({
  steps,
  currentIndex,
  onOpen,
}: {
  steps: readonly { title: string; answered: boolean }[];
  /** 0-based index into `steps`. */
  currentIndex: number;
  onOpen: (index: number) => void;
}) {
  return (
    <nav aria-label="Booking progress">
      <ol className="flex items-center gap-[var(--space-8)]">
        {steps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const canOpen = !isCurrent && step.answered && index < currentIndex;

          const rung = (
            <span
              className={cn(
                "type-label flex size-6 shrink-0 items-center justify-center border tabular-nums transition-colors",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : canOpen
                    ? "border-border-strong text-muted-foreground group-hover/rung:border-primary group-hover/rung:text-primary"
                    : "border-border text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
          );

          return (
            <li key={step.title} className="flex flex-1 items-center gap-[var(--space-8)]">
              {canOpen ? (
                <button
                  type="button"
                  className="group/rung focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={() => onOpen(index)}
                >
                  {rung}
                  <span className="sr-only">
                    Step {index + 1}, {step.title} — answered. Go back to change it.
                  </span>
                </button>
              ) : (
                <span aria-current={isCurrent ? "step" : undefined}>
                  {rung}
                  <span className="sr-only">
                    Step {index + 1}, {step.title}
                    {isCurrent ? " — current step" : ""}
                  </span>
                </span>
              )}
              {/* The connector. Not the last one: a rule running off the end of
                  the last rung would suggest a fifth step. */}
              {index < steps.length - 1 && (
                <span className="h-px flex-1 bg-border" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
      {/* The position said in words, so the rail is never the sole carrier. */}
      <p className="type-label mt-[var(--space-12)] text-muted-foreground">
        Step {currentIndex + 1} of {steps.length}
      </p>
    </nav>
  );
}
