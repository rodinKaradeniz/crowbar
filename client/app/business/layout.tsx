import { redirect } from "next/navigation";

import { BusinessRail } from "@/components/business-rail";
import { BusinessRouteGuard } from "@/components/business-route-guard";
import { BusinessTopbar } from "@/components/business-topbar";
import { DashboardErrorBoundary } from "@/components/dashboard-error-boundary";
import { Ground } from "@/components/ground";
import { RegionalSettingsProvider } from "@/contexts/regional-context";
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
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }
  if (user.type !== "staff") {
    redirect("/");
  }

  const business = await fetchBusiness(user.businessId);
  const docsAssistantEnabled =
    process.env.DOCS_ASSISTANT_ENABLED === "true" &&
    Boolean(process.env.OPENAI_API_KEY);

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

      <div className="flex min-h-svh items-stretch bg-background text-foreground">
        <BusinessRail />

        <div className="flex min-w-0 flex-1 flex-col">
          <BusinessTopbar
            businessName={business?.name ?? "Your venue"}
            docsAssistantEnabled={docsAssistantEnabled}
          />

          <DashboardErrorBoundary>
            <main className="flex-1">
              <BusinessRouteGuard>{children}</BusinessRouteGuard>
            </main>
          </DashboardErrorBoundary>
        </div>
      </div>
    </RegionalSettingsProvider>
  );
}
