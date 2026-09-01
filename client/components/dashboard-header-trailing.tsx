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
 */
export function DashboardHeaderTrailing() {
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="inline-block h-9 w-9 shrink-0" aria-hidden />
      </div>
    );
  }

  return <NotificationTrigger />;
}
