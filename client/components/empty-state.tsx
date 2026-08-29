import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
}

interface EmptyStateProps {
  /** States what is TRUE, not what is missing. "Nobody's waiting", not "No data". */
  title: string;
  /** One sentence on how the space fills. */
  description?: string;
  /** The action that sets it up. */
  action?: EmptyStateAction;
  /** The action that does it by hand. Two actions is the shape; one is fine. */
  secondaryAction?: EmptyStateAction;
  className?: string;
  /**
   * @deprecated No illustration, ever — including an icon. Accepted so the 7
   * unported call sites still compile; the prop is ignored and is REMOVED IN
   * PHASE 7.
   */
  icon?: unknown;
}

/**
 * The empty state.
 *
 * A 26×2 brand rule, a title that states what is true, one sentence on how the
 * space fills, and up to two actions — one that sets it up, one that does it by
 * hand.
 *
 * **No illustration, ever.** The retired version centred a Lucide icon in a
 * circle; rev 3 has no such object.
 *
 * Empty FIGURES are em-dashes rather than zeroes — that rule lives in
 * `ui/figure.tsx`, because a zero is a claim about a night that has not
 * happened. This component is for empty collections.
 *
 * Never fake data to avoid designing one of these, and only offer an action the
 * user can actually complete.
 */
export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("py-[var(--space-48)]", className)}>
      {/* The brand rule — 26×2. Identity, not severity. */}
      <div className="h-[2px] w-[26px] bg-primary" aria-hidden />

      <p className="mt-[var(--space-16)] font-display text-[length:var(--t1-size)] leading-[var(--t1-lh)] tracking-[var(--t1-ls)] font-bold text-foreground">
        {title}
      </p>

      {description ? (
        <p className="mt-[var(--space-8)] max-w-[52ch] text-[length:var(--ui-size)] leading-[var(--ui-lh)] text-muted-foreground">
          {description}
        </p>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-[var(--space-24)] flex flex-wrap gap-[var(--space-8)]">
          {action ? <EmptyStateButton action={action} variant="primary" /> : null}
          {secondaryAction ? (
            <EmptyStateButton action={secondaryAction} variant="secondary" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmptyStateButton({
  action,
  variant,
}: {
  action: EmptyStateAction;
  variant: "primary" | "secondary";
}) {
  if (action.href) {
    return (
      <Button variant={variant} asChild>
        <a href={action.href}>{action.label}</a>
      </Button>
    );
  }
  return (
    <Button variant={variant} onClick={action.onClick}>
      {action.label}
    </Button>
  );
}
