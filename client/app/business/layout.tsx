import { redirect } from "next/navigation";

import { BusinessRouteGuard } from "@/components/business-route-guard";
import { BusinessShell } from "@/components/business-shell";
import { DashboardErrorBoundary } from "@/components/dashboard-error-boundary";
import { Ground } from "@/components/ground";
import { RegionalSettingsProvider } from "@/contexts/regional-context";
import { WorkspaceUnreachable } from "@/components/workspace-unreachable";
import { ApiUnreachableError } from "@/lib/api-client";
import { fetchBusiness } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/**
 * The workspace shell: a permanent 228px rail beside the screen.
 *
 * This replaces the collapsed off-canvas drawer and its trigger. The design
 * fixes the rail open — a bartender mid-service should not have to open a menu
 * to see that six tickets are waiting, and the rail's badges are part of how
 * the night is read.
 *
 * The whole `/business` tree is on the INK ground, applied by the boot script
 * in the root layout so it survives soft navigation and portalled overlays.
 */
export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout is the FIRST gate, so it is where an outage has to be caught:
  // a `redirect()` cannot be caught by `error.tsx`, so once a page redirects to
  // the login screen no boundary can undo it. `getCurrentUser` now rethrows an
  // unreachable server rather than reporting "not signed in", and the shell is
  // replaced by an honest screen with the session left intact.
  let user;
  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiUnreachableError) {
      return (
        <>
          <Ground ground="ink" />
          <WorkspaceUnreachable />
        </>
      );
    }
    throw error;
  }

  if (!user) {
    redirect("/auth/login");
  }
  if (user.type !== "staff") {
    redirect("/");
  }

  const business = await fetchBusiness(user.businessId);

  return (
    <RegionalSettingsProvider
      settings={{
        countryCode: business?.countryCode,
        currencyCode: business?.currencyCode,
        locale: business?.locale,
        timezone: business?.timezone,
        taxLabel: business?.taxLabel,
      }}
    >
      {/* The boot script covers a hard load; this covers soft navigation in
          from auth, which would otherwise leave the workspace on paper. */}
      <Ground ground="ink" />

      <BusinessShell businessName={business?.name ?? "Your venue"}>
        <DashboardErrorBoundary>
          <BusinessRouteGuard>{children}</BusinessRouteGuard>
        </DashboardErrorBoundary>
      </BusinessShell>
    </RegionalSettingsProvider>
  );
}
