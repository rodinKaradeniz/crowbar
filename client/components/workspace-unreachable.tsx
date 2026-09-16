import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageBody, PageHeader } from "@/components/page-header";

/**
 * What the workspace shows when Crowbar cannot reach its own server.
 *
 * THE REQUIREMENT IS ONE SENTENCE: an API outage never asks a bartender for
 * their password. This screen exists because the alternative was
 * `/auth/login?redirect=…` on top of a dead board, mid-shift.
 *
 * It deliberately renders NO board data. The JWT carries only `sub`,
 * `user_type` and `session_version` — no `business_id`, no `role` — so the
 * workspace cannot be rendered from the token, and anything shown here would
 * be invented. The honest offer is the state of the world and a way to try
 * again.
 *
 * Not a severity, and not the offline bar: those belong to a LIVE board that
 * has lost its feed while the rest of the screen still works. Here there is no
 * screen. `docs/DESIGN.md`'s rank is about items on a working surface.
 */
export function WorkspaceUnreachable() {
  return (
    <>
      <PageHeader
        title="Crowbar cannot reach the server"
        description="Your session is still signed in. Nothing you have done has been lost."
      />
      <PageBody>
        <div className="max-w-[var(--row-content-min)] space-y-[var(--space-16)]">
          <p className="text-[length:var(--ui-size)] text-muted-foreground">
            The board cannot load while the server is unreachable. Keep serving
            from what you have; try again in a moment.
          </p>
          <Button asChild variant="secondary">
            <Link href="/business/overview">Try again</Link>
          </Button>
        </div>
      </PageBody>
    </>
  );
}
