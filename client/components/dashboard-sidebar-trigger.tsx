"use client";

import * as React from "react";
import { PanelLeftIcon, SearchIcon } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface DashboardSidebarTriggerProps {
  onSearchClick: () => void;
  className?: string;
}

export function DashboardSidebarTrigger({
  onSearchClick,
  className,
}: DashboardSidebarTriggerProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <div className={cn("flex items-center gap-1 shrink-0", className)}>
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent transition-colors"
        aria-label="Toggle Sidebar"
      >
        <PanelLeftIcon className="h-4 w-4" />
      </button>
      <div className="h-4 w-px bg-border" />
      <button
        onClick={onSearchClick}
        className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent transition-colors"
        aria-label="Search"
      >
        <SearchIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
