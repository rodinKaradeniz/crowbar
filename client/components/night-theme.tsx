"use client";

import { useEffect } from "react";

/**
 * Applies the guest-facing "front of house" token set (.theme-night in
 * globals.css) for the lifetime of the page. Set on <html> so portaled
 * content (sheets, popovers, selects, toasts) inherits it too.
 * Presentation only — renders nothing.
 */
export function NightTheme() {
  useEffect(() => {
    document.documentElement.classList.add("theme-night");
    return () => document.documentElement.classList.remove("theme-night");
  }, []);

  return null;
}
