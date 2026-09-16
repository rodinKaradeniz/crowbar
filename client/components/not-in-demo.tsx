import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";

/**
 * Where a demo visitor lands on a route the demo does not cover — account
 * flows, venue setup, and links that need a signed guest credential. The list
 * is `lib/demo/scope.ts`; the rewrite that sends visitors here is in
 * `next.config.ts`, demo builds only.
 *
 * States what is true and offers the way back. Not an error, so no severity.
 */
export function WorkspaceNotInDemo() {
  return (
    <>
      <PageHeader title="Not in the demo" />
      <PageBody>
        <EmptyState
          title="This part of Crowbar is not in the demo"
          description="Setup, settings and account pages need a real venue behind them. The evening's service is all here."
          action={{ label: "Back to the overview", href: "/business/overview" }}
        />
      </PageBody>
    </>
  );
}

export function PublicNotInDemo() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-[var(--space-24)] text-foreground">
      <div className="w-full max-w-[38ch]">
        <EmptyState
          title="This page is not in the demo"
          description="Account and guest-link pages need a real venue behind them. The staff workspace and the guest booking, menu, ordering and queue pages are all here."
          action={{ label: "Enter the demo", href: "/auth/login" }}
        />
        <p className="text-[length:var(--ui-size)] text-muted-foreground">
          Or go back to <Link href="/" className="border-b border-border-strong font-semibold text-foreground">the Crowbar home page</Link>.
        </p>
      </div>
    </main>
  );
}
