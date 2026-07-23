"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Staff dashboard light/dark theme.
 *
 * Mechanism mirrors <NightTheme /> (Phase 1): a class on <html> so portaled
 * dialogs/popovers/toasts inherit the tokens. `.dark` shares its token block
 * with the guest `.theme-night` in globals.css — one warm "after dark" theme,
 * not a second dark-mode concept. Choice persists in localStorage and is
 * scoped to the dashboard: applied while the dashboard is mounted, removed
 * on unmount (guest pages keep forcing .theme-night via <NightTheme />).
 */
const STORAGE_KEY = "crowbar-staff-theme";

function applyStored() {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "dark") {
      document.documentElement.classList.add("dark");
    }
  } catch {
    // localStorage unavailable — stay light
  }
}

/** Mounted once in the business layout; owns the lifetime of the .dark class. */
export function StaffThemeInit() {
  useEffect(() => {
    applyStored();
    return () => document.documentElement.classList.remove("dark");
  }, []);

  return null;
}

/**
 * Sun/moon toggle rendered in the dashboard header. Only mounted after the
 * header's useMounted gate (client-side, post-hydration), so reading the
 * documentElement class in the lazy initializer is safe and already reflects
 * the boot script's applied preference.
 */
export function StaffThemeToggle() {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // persistence unavailable — theme still applies for this session
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
