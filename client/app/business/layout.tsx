import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BusinessSidebar } from "@/components/business-sidebar";
import { DashboardLayoutWrapper } from "@/components/dashboard-layout-wrapper";
import { DashboardErrorBoundary } from "@/components/dashboard-error-boundary";
import { StaffThemeInit } from "@/components/staff-theme";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

// Paints a stored dark preference before hydration so the dashboard doesn't
// flash light. Mirrors the storage key in components/staff-theme.tsx.
const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem("crowbar-staff-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

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
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      <StaffThemeInit />
      <BusinessSidebar />
      <SidebarInset>
        <DashboardLayoutWrapper variant="business">
          <DashboardErrorBoundary>
            <main className="flex-1 overflow-auto">{children}</main>
          </DashboardErrorBoundary>
        </DashboardLayoutWrapper>
      </SidebarInset>
    </SidebarProvider>
  );
}
