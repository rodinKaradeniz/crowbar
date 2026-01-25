import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { VenueSidebar } from "@/components/venue-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function VenueLayout({
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
    <SidebarProvider>
      <VenueSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
