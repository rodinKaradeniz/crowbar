"use client";

import { Sidebar, SidebarRail } from "@/components/ui/sidebar";
import { CustomerSidebarContent } from "@/components/customer-sidebar-content";

export function CustomerSidebar() {
  return (
    <Sidebar collapsible="icon">
      <CustomerSidebarContent />
      <SidebarRail />
    </Sidebar>
  );
}
