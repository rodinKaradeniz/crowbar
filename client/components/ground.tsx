"use client";

import { useEffect } from "react";

/**
 * Pins the ground for a route subtree.
 *
 * The design fixes grounds by surface rather than by preference: the product is
 * ink, marketing and auth are paper. The class has to sit on `<html>`, because
 * dialogs, sheets and toasts portal to the document body and would otherwise
 * resolve against the wrong ground.
 *
 * WHY THIS EXISTS ALONGSIDE THE BOOT SCRIPT IN `app/layout.tsx`. The boot
 * script runs once, before paint, on a hard load — that is what stops a flash
 * of paper before the workspace appears. It does not run again on a soft
 * navigation, so signing in (auth, paper → workspace, ink) left the entire
 * product rendering on the marketing ground. This effect covers the soft-nav
 * case, and removes the class on unmount so signing out lands back on paper.
 *
 * Both are needed. Neither is sufficient.
 */
export function Ground({ ground }: { ground: "ink" | "paper" }) {
  useEffect(() => {
    const root = document.documentElement;

    if (ground === "ink") {
      root.classList.add("ground-ink");
      return () => root.classList.remove("ground-ink");
    }

    root.classList.remove("ground-ink");
  }, [ground]);

  return null;
}
