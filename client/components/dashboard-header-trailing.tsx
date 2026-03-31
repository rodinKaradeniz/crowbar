"use client";

import { BusinessDocsChatTrigger } from "@/components/business-docs-chat-trigger";
import { NotificationTrigger } from "@/components/notification-trigger";
import { useMounted } from "@/hooks/use-mounted";

interface DashboardHeaderTrailingProps {
  variant: "customer" | "business";
}

/**
 * Radix (Tooltip + Dialog/Sheet) generates unstable ids between SSR and hydration.
 * Render lightweight placeholders until mounted, then mount the real triggers.
 */
export function DashboardHeaderTrailing({ variant }: DashboardHeaderTrailingProps) {
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="inline-block h-9 w-9 shrink-0" aria-hidden />
        {variant === "business" ? (
          <span className="inline-block h-9 w-9 shrink-0" aria-hidden />
        ) : null}
      </div>
    );
  }

  return (
    <>
      <NotificationTrigger />
      {variant === "business" ? <BusinessDocsChatTrigger /> : null}
    </>
  );
}
