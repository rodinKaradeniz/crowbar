"use client";

import * as React from "react";
import { DashboardSidebarTrigger } from "@/components/dashboard-sidebar-trigger";
import { DashboardFloatingSidebar } from "@/components/dashboard-floating-sidebar";
import { DashboardSearch } from "@/components/dashboard-search";
import { DashboardHeader } from "@/components/dashboard-header";

interface DashboardLayoutWrapperProps {
  variant: "customer" | "business";
  floatingSidebarContent: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardLayoutWrapper({
  variant,
  floatingSidebarContent,
  children,
}: DashboardLayoutWrapperProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <>
      {/* Floating sidebar on hover (visible when sidebar is collapsed) */}
      <DashboardFloatingSidebar>
        {floatingSidebarContent}
      </DashboardFloatingSidebar>

      {/* Search dialog */}
      <DashboardSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        variant={variant}
      />

      {/* Header with inline trigger */}
      <DashboardHeader
        leading={
          <DashboardSidebarTrigger
            onSearchClick={() => setSearchOpen(true)}
          />
        }
      />

      {children}
    </>
  );
}
