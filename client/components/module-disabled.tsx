import Link from "next/link";

import { Button } from "@/components/ui/button";

interface ModuleDisabledProps {
  moduleName: string;
}

/**
 * "Your venue has not bought this."
 *
 * Deliberately a different answer from `RoleRestricted` ("your job does not
 * include this") — telling an operator the wrong one sends them to a settings
 * page that cannot help them.
 *
 * The design's rule is stronger than a panel: when a module is off, **the nav
 * entry is removed, not greyed** (States board 03 — "the entry is gone, not
 * greyed out"). No dead entries teasing what cannot be opened. This screen is
 * only what a direct navigation lands on; `business-sidebar-content.tsx` owns
 * the removal.
 */
export function ModuleDisabled({ moduleName }: ModuleDisabledProps) {
  return (
    <div className="flex flex-1 items-start justify-center p-[var(--space-32)]">
      <div className="w-full max-w-[52ch] pt-[var(--space-48)]">
        <div className="h-[2px] w-[26px] bg-primary" aria-hidden />

        <h1 className="mt-[var(--space-16)] font-display text-[length:var(--t1-size)] leading-[var(--t1-lh)] tracking-[var(--t1-ls)] font-bold">
          {moduleName} is switched off
        </h1>

        <p className="mt-[var(--space-8)] text-[length:var(--ui-size)] leading-[var(--ui-lh)] text-muted-foreground">
          Your records are kept. Switching it back on restores this workspace
          and returns the entry to the sidebar for everyone.
        </p>

        <div className="mt-[var(--space-24)]">
          <Button asChild>
            <Link href="/business/settings/modules">Turn {moduleName} back on</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
