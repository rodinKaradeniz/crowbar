"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { clientGetQueueActiveCount } from "@/lib/client-api";
import { hasModule, type ModuleKey } from "@/lib/modules";
import { visibleNavGroups, type NavGroup } from "@/lib/nav";
import { hasCapability, type Capability } from "@/lib/permissions";

/**
 * What the workspace navigation shows, derived once for both shapes of it.
 *
 * The 228px rail and the 76px bottom bar are genuinely different layouts, but
 * they must never disagree about what this operator can open — so the gates and
 * the live count are computed here and passed to whichever one is rendering.
 *
 * Both gates FAIL CLOSED while `/me/context` is loading. An entry that appears
 * and then vanishes is a control the API would have rejected anyway, and on a
 * disabled module it briefly shows a tenant something they have not bought.
 */
export function useWorkspaceNav(): {
  groups: NavGroup[];
  queueCount: number | null;
  canSeatWalkIn: boolean;
} {
  const { user, meContext } = useAuth();
  const currentRole =
    meContext?.role ?? (user?.type === "staff" ? user.role : undefined);

  const can = (capability: Capability) =>
    meContext?.capabilities
      ? meContext.capabilities.includes(capability)
      : hasCapability(currentRole, capability);

  const moduleEnabled = (module: ModuleKey) =>
    meContext ? hasModule(meContext.enabledModules, module) : false;

  const groups = visibleNavGroups(moduleEnabled, can);
  const queueEnabled = moduleEnabled("queue");
  const queueCount = useQueueCount(queueEnabled);

  return {
    groups,
    queueCount,
    canSeatWalkIn: queueEnabled && can("queue.manage"),
  };
}

/**
 * The one live count in the navigation.
 *
 * The canvas also badges Tickets, Reservations and Inventory. No count endpoint
 * exists for those, and adding three more 30-second polls to every screen is a
 * change to how the app loads, not a presentation change. Recorded in
 * `docs/TODO.md` §7a.
 *
 * It is neutral, not critical. The canvas fills the Tickets badge with
 * `--critical-fill`, which under the rank means "a ticket is past its target" —
 * and no target is stored anywhere, so that fill cannot be earned.
 */
function useQueueCount(enabled: boolean): number | null {
  const { user } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const businessId = user?.type === "staff" ? user.businessId : null;

  useEffect(() => {
    if (!enabled || !businessId) return;

    const refresh = () => {
      clientGetQueueActiveCount(businessId)
        .then(setCount)
        .catch(() => {});
    };

    refresh();
    timer.current = setInterval(refresh, 30_000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [enabled, businessId]);

  // Gated on read rather than cleared in the effect: a stale count must never
  // outlive the module being switched off.
  return enabled ? count : null;
}
