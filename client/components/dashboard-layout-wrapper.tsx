"use client";

import * as React from "react";
import { DashboardSidebarTrigger } from "@/components/dashboard-sidebar-trigger";
import { DashboardSearch } from "@/components/dashboard-search";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardHeaderTrailing } from "@/components/dashboard-header-trailing";

interface DashboardLayoutWrapperProps {
  variant: "customer" | "business";
  floatingSidebarContent?: React.ReactNode;
  children: React.ReactNode;
  docsAssistantEnabled?: boolean;
}

export function DashboardLayoutWrapper({
  variant,
  children,
  docsAssistantEnabled = false,
}: DashboardLayoutWrapperProps) {
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <>
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
        trailing={<DashboardHeaderTrailing variant={variant} docsAssistantEnabled={docsAssistantEnabled} />}
      />

      {children}
    </>
  );
}
