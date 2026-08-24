"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Landing hero. A code-generated light-and-grid treatment sits behind the type
 * opacity and fades to fully transparent across the hero's own scroll range;
 * the text drifts upward slower than the page (parallax lag) and fades on the
 * same curve. Scroll values are written to refs per frame — no re-renders.
 * prefers-reduced-motion keeps both layers static.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const BASE_PHOTO_OPACITY = 0.35;

export function LandingHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        // 0 at page top, 1 when the hero has fully scrolled out of view.
        const p = clamp01(-rect.top / rect.height);
        if (photoRef.current) {
          photoRef.current.style.opacity = String(BASE_PHOTO_OPACITY * (1 - p));
        }
        if (textRef.current) {
          // Drift up slower than the page (lags behind) + synced fade.
          textRef.current.style.transform = `translateY(${(p * 140).toFixed(1)}px)`;
          textRef.current.style.opacity = String(clamp01(1 - p * 1.15));
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-svh overflow-hidden flex flex-col items-center justify-center text-center px-6 pt-14"
    >
      {/* Code-generated atmosphere behind the type, fading out with scroll. */}
      <div
        ref={photoRef}
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: BASE_PHOTO_OPACITY }}
        aria-hidden
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,color-mix(in_oklab,var(--brass)_42%,transparent),transparent_32%),radial-gradient(circle_at_75%_62%,color-mix(in_oklab,var(--dubbel)_35%,transparent),transparent_34%),repeating-linear-gradient(115deg,transparent_0_34px,color-mix(in_oklab,var(--foreground)_6%,transparent)_35px_36px)]" />
        <div className="absolute inset-0 bg-linear-to-b from-background via-transparent to-background" />
      </div>

      <div ref={textRef} className="relative flex flex-col items-center">
        <p className="eyebrow text-brass-deep mb-5">Bar operations platform</p>
        <h1 className="font-display text-5xl sm:text-6xl md:text-8xl tracking-tight max-w-4xl leading-[1.05]">
          The whole bar,
          <br />
          on one tab.
        </h1>
        <div className="rule-double my-8 w-36" />
        <p className="text-lg text-muted-foreground max-w-xl">
          Reservations, walk-ins, orders, and stock — Crowbar runs the room so
          you can run the bar.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mt-10">
          <Button asChild size="lg">
            <Link href="/auth/register" className="flex items-center gap-2">
              Create a venue workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="absolute bottom-8 inset-x-0 flex justify-center text-muted-foreground">
        <ArrowDown className="h-4 w-4 animate-bounce motion-reduce:animate-none" aria-hidden />
      </div>
    </section>
  );
}
