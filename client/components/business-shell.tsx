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
 * THREE layouts, one set of gates.
 *
 * Above `--bp-desktop` the workspace is a 228px rail beside the screen, with
 * the primary action in the header. Between `--bp-phone` and `--bp-desktop` —
 * the 1024x768 tablet — the rail becomes a 76px bar along the bottom and the
 * primary action moves into the arc of a right thumb. Below `--bp-phone` both
 * of those give way to a sheet behind a menu button in the header.
 *
 * They are genuinely different shapes — a bar is not a collapsed rail, and a
 * sheet is not a narrow bar — but all three take their entries from
 * `useWorkspaceNav`, so they can never disagree about what this operator is
 * allowed to open.
 *
 * WHY THE BAR STOPS AT --bp-phone RATHER THAN GOING AWAY. Its five fixed slots
 * are a TABLET answer: 1024px of width to spend, and a thumb already resting at
 * the bottom edge. The same five slots on a 390px phone are 78px each, and the
 * bottom edge of a phone is where the browser chrome lives. So the bar keeps
 * the device it was designed for and yields the one it was not.
 *
 * All three are always in the tree; the breakpoints decide which one paints.
 * That costs two hidden subtrees and buys a layout that changes on rotation
 * without a remount, which matters on the device that gets rotated.
 */
/**
 * Where the floating action may appear: the screens whose bottom-right corner
 * carries nothing interactive. Everywhere else the screen's own action stays in
 * its header, which is reachable and never covers anything.
 */
const TABLET_ACTION_ROUTES = ["/business/overview", "/business/floor"];

export function BusinessShell({
  businessName,
  children,
}: {
  businessName: string;
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
          canSeatWalkIn={canSeatWalkIn}
          groups={groups}
          queueCount={queueCount}
        />

        {/* Clears the bottom bar AND the floating action above it, so the
            last row of any list stays reachable rather than sitting under a
            button. Only where that bar exists: on a phone there is nothing
            fixed to the bottom, and the reserve would be dead space under the
            last row of every list on the shortest screen in the product. */}
        <main className="flex-1 pb-0 phone:pb-[calc(var(--bottom-nav)+96px)] desktop:pb-0">
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
