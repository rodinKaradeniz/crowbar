"use client";

import { Sidebar } from "@/components/ui/sidebar";
import { CustomerSidebarContent } from "@/components/customer-sidebar-content";

export function CustomerSidebar() {
  return (
    <Sidebar>
      <CustomerSidebarContent />
    </Sidebar>
  );
}
