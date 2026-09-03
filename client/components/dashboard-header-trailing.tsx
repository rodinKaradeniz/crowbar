"use client";

import { NotificationTrigger } from "@/components/notification-trigger";
import { useMounted } from "@/hooks/use-mounted";

/**
 * Radix (Tooltip + Dialog/Sheet) generates unstable ids between SSR and
 * hydration. Render a lightweight placeholder until mounted, then mount the
 * real trigger — the placeholder holds the same 36px so the header does not
 * shift when it swaps.
 *
 * There is one trigger. The docs assistant that used to sit beside it was
 * removed along with its route and its provider client; `variant` went with it,
 * since the only difference it ever made was whether that second trigger
 * rendered.
 *
 * THE BELL IS HIDDEN BELOW --bp-phone, NOT UNMOUNTED. The phone header is one
 * line and opens the panel from the navigation sheet instead — but that sheet
 * unmounts its contents when it closes, so the panel has to stay mounted here.
 * `phone:inline-flex` hides the button and keeps the component, which is also
 * what keeps the unread poll running and `onUnreadChange` reporting.
 */
export function DashboardHeaderTrailing({
  notificationsOpen,
  onNotificationsOpenChange,
  onUnreadChange,
}: {
  notificationsOpen?: boolean;
  onNotificationsOpenChange?: (open: boolean) => void;
  onUnreadChange?: (unread: number) => void;
} = {}) {
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden h-9 w-9 shrink-0 phone:inline-block" aria-hidden />
      </div>
    );
  }

  return (
    <NotificationTrigger
      open={notificationsOpen}
      onOpenChange={onNotificationsOpenChange}
      onUnreadChange={onUnreadChange}
      triggerClassName="hidden phone:inline-flex"
    />
  );
}
