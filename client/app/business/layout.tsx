import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BusinessSidebar } from "@/components/business-sidebar";
import { DashboardLayoutWrapper } from "@/components/dashboard-layout-wrapper";
import { DashboardErrorBoundary } from "@/components/dashboard-error-boundary";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BusinessRouteGuard } from "@/components/business-route-guard";
import { fetchBusiness } from "@/lib/api";
import { RegionalSettingsProvider } from "@/contexts/regional-context";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get current user from session
  const user = await getCurrentUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect("/auth/login");
  }

  // Redirect to home if not staff
  if (user.type !== "staff") {
    redirect("/");
  }
  const business = await fetchBusiness(user.businessId);

  // User is authenticated staff - render layout
  return (
    <RegionalSettingsProvider settings={{
      countryCode: business?.countryCode,
      currencyCode: business?.currencyCode,
      locale: business?.locale,
      timezone: business?.timezone,
      taxLabel: business?.taxLabel,
    }}>
    <SidebarProvider defaultOpen={false}>
      <BusinessSidebar />
      <SidebarInset>
        <DashboardLayoutWrapper
          variant="business"
          docsAssistantEnabled={process.env.DOCS_ASSISTANT_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY)}
        >
          <DashboardErrorBoundary>
            <main className="flex-1 overflow-auto">
              <BusinessRouteGuard>{children}</BusinessRouteGuard>
            </main>
          </DashboardErrorBoundary>
        </DashboardLayoutWrapper>
      </SidebarInset>
    </SidebarProvider>
    </RegionalSettingsProvider>
  );
}
