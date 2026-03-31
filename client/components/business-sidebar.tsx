"use client";

import { Sidebar, SidebarRail } from "@/components/ui/sidebar";
import { BusinessSidebarContent } from "@/components/business-sidebar-content";

export function BusinessSidebar() {
  return (
    <Sidebar collapsible="icon">
      <BusinessSidebarContent />
      <SidebarRail />
    </Sidebar>
  );
}
