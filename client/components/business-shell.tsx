"use client";

import {
  BusinessBottomBar,
  TabletPrimaryAction,
} from "@/components/business-bottom-bar";
import { BusinessRail } from "@/components/business-rail";
import { BusinessTopbar } from "@/components/business-topbar";
import { useWorkspaceNav } from "@/hooks/use-workspace-nav";
import { usePathname } from "next/navigation";

/**
 * Two layouts, one set of gates.
 *
 * Above `--bp-desktop` the workspace is a 228px rail beside the screen, with
 * the primary action in the header. Below it, the rail becomes a 76px bar
 * along the bottom and the primary action moves into the arc of a right thumb.
 * They are genuinely different shapes — a bar is not a collapsed rail — but
 * they share `useWorkspaceNav`, so they can never disagree about what this
 * operator is allowed to open.
 *
 * Both are always in the tree; the breakpoint decides which one paints. That
 * costs one hidden subtree and buys a layout that changes on rotation without
 * a remount, which matters on the device that gets rotated.
 */
/**
 * Where the floating action may appear: the screens whose bottom-right corner
 * carries nothing interactive. Everywhere else the screen's own action stays in
 * its header, which is reachable and never covers anything.
 */
const TABLET_ACTION_ROUTES = ["/business/overview", "/business/floor"];

export function BusinessShell({
  businessName,
  docsAssistantEnabled,
  children,
}: {
  businessName: string;
  docsAssistantEnabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { groups, queueCount, canSeatWalkIn } = useWorkspaceNav();

  return (
    <div className="flex min-h-svh items-stretch bg-background text-foreground">
      <BusinessRail groups={groups} queueCount={queueCount} />

      <div className="flex min-w-0 flex-1 flex-col">
        <BusinessTopbar
          businessName={businessName}
          docsAssistantEnabled={docsAssistantEnabled}
          canSeatWalkIn={canSeatWalkIn}
        />

        {/* Clears the bottom bar AND the floating action above it, so the
            last row of any list stays reachable rather than sitting under a
            button. */}
        <main className="flex-1 pb-[calc(var(--bottom-nav)+96px)] desktop:pb-0">
          {children}
        </main>
      </div>

      <BusinessBottomBar groups={groups} queueCount={queueCount} />

      <TabletPrimaryAction
        href="/business/queue"
        show={canSeatWalkIn && TABLET_ACTION_ROUTES.includes(pathname)}
      >
        Seat a walk-in
      </TabletPrimaryAction>
    </div>
  );
}
