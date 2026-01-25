import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CustomerSidebar } from "@/components/customer-sidebar";
import { DashboardHeader } from "@/components/dashboard-header";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CustomerLayout({
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

  // Redirect to home if not customer
  if (user.type !== "customer") {
    if (user.type === "staff") {
      redirect("/venue/overview");
    }
    redirect("/");
  }

  // User is authenticated customer - render layout
  return (
    <SidebarProvider>
      <CustomerSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
