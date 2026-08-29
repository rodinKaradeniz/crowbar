import Link from "next/link";

import { Button } from "@/components/ui/button";
import { roleLabel, type StaffRole } from "@/lib/permissions";

interface RoleRestrictedProps {
  /** What the page is, in the operator's words — "Cost control", "Staff". */
  surface: string;
  /** The role the signed-in user actually holds. */
  role: StaffRole | string | null | undefined;
}

/**
 * "Your job does not include this."
 *
 * Shown when a page exists and its module is on, but this role does not cover
 * it. Deliberately distinct from `ModuleDisabled` ("your venue has not bought
 * this") — those are different answers, and telling an operator the wrong one
 * sends them to a settings page that cannot help.
 *
 * The server enforces the same boundary; this only saves the round trip. As
 * with a disabled module, the nav does not render an entry the role cannot
 * open — no greyed-out items teasing what someone cannot reach mid-rush.
 */
export function RoleRestricted({ surface, role }: RoleRestrictedProps) {
  return (
    <div className="flex flex-1 items-start justify-center p-[var(--space-32)]">
      <div className="w-full max-w-[52ch] pt-[var(--space-48)]">
        <div className="h-[2px] w-[26px] bg-primary" aria-hidden />

        <h1 className="mt-[var(--space-16)] font-display text-[length:var(--t1-size)] leading-[var(--t1-lh)] tracking-[var(--t1-ls)] font-bold">
          Not part of your role
        </h1>

        <p className="mt-[var(--space-8)] text-[length:var(--ui-size)] leading-[var(--ui-lh)] text-muted-foreground">
          <span className="text-foreground">{surface}</span> is not open to the{" "}
          <span className="text-foreground">{roleLabel(role)}</span> role. An
          owner or manager can change that from Staff in a few seconds.
        </p>

        <div className="mt-[var(--space-24)]">
          <Button variant="secondary" asChild>
            <Link href="/business/overview">Back to Overview</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
