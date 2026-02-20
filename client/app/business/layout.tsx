import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BusinessSidebar } from "@/components/business-sidebar";
import { DashboardLayoutWrapper } from "@/components/dashboard-layout-wrapper";
import { BusinessFloatingContent } from "@/components/business-floating-content";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

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

  // User is authenticated staff - render layout
  return (
    <SidebarProvider defaultOpen={false}>
      <BusinessSidebar />
      <SidebarInset>
        <DashboardLayoutWrapper
          variant="business"
          floatingSidebarContent={<BusinessFloatingContent />}
        >
          <main className="flex-1 overflow-auto">{children}</main>
        </DashboardLayoutWrapper>
      </SidebarInset>
    </SidebarProvider>
  );
}
