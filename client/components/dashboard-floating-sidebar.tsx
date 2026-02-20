"use client";

import * as React from "react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface DashboardFloatingSidebarProps {
  children: React.ReactNode;
}

export function DashboardFloatingSidebar({
  children,
}: DashboardFloatingSidebarProps) {
  const { state } = useSidebar();
  const [isHovered, setIsHovered] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only show the hover zone when sidebar is collapsed
  const isCollapsed = state === "collapsed";

  const handleMouseEnter = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);

  const handleMouseLeave = React.useCallback(() => {
    // Small delay before hiding to prevent flickering
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 300);
  }, []);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!isCollapsed) return null;

  return (
    <>
      {/* Invisible hover zone at the left edge of the viewport */}
      <div
        className="fixed top-0 left-0 w-1.5 h-full z-50"
        onMouseEnter={handleMouseEnter}
      />

      {/* Floating sidebar panel */}
      <div
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-[16rem] transition-transform duration-300 ease-in-out",
          isHovered ? "translate-x-0" : "-translate-x-full"
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="h-full m-2 mr-0 rounded-lg border bg-sidebar shadow-lg overflow-hidden flex flex-col">
          {children}
        </div>
      </div>

      {/* Backdrop when floating sidebar is visible */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity duration-300",
          isHovered
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onMouseEnter={handleMouseLeave}
      />
    </>
  );
}
