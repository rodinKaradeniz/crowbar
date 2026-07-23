"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Fade-in + slide-up on first viewport entry (landing page, Phase 2.1).
 * Fires once per element — the observer unobserves after entry, so scrolling
 * back and forth never re-triggers it. Styles live in globals.css (.reveal /
 * .is-in); prefers-reduced-motion renders content visible with no transition.
 */
export function Reveal({
  as: Tag = "div",
  className,
  delay,
  children,
}: {
  as?: "div" | "section" | "p" | "span" | "footer";
  className?: string;
  /** transition-delay in ms, for small local staggers */
  delay?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("is-in");
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={cn("reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
