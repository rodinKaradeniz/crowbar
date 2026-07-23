"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * The five modules as a sticky, fanning deck (Phase 2.1, widened in 2.2).
 *
 * Desktop: each card is position:sticky with a 20vh stop; all cards share the
 * whole section as their containing block, so earlier cards hold their stop
 * while later ones arrive over them. A per-frame handler shrinks already-stuck
 * cards as each later card approaches. The shrink is anchored to the card's
 * top-RIGHT corner (transform-origin) so the right edge — which sits flush
 * against the viewport edge — stays visually fixed while the left and bottom
 * edges recede inward.
 *
 * Card tones walk the SRM scale in order (foam → lager → märzen → dubbel →
 * porter), five genuinely distinct steps of the same beer-color progression.
 *
 * Mobile (< md) and prefers-reduced-motion: plain sequential list, no
 * stacking mechanics.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface StackFeature {
  name: string;
  motto: string;
  /** 2–3 sentence plain-prose description */
  description: string;
  /** short capability bullets, rendered as an actual list */
  bullets: string[];
}

/**
 * Five opaque tones in SRM order: foam card (≈2), lager (8), märzen (~12 —
 * interpolated midpoint of lager→dubbel, see globals.css), dubbel (~17),
 * porter (35). Each darker step brings its own legible ink/foam text tones.
 */
const CARD_TONES = [
  {
    bg: "bg-card",
    ink: "text-foreground",
    body: "text-muted-foreground",
    marker: "text-brass-deep/80",
    line: "bg-border",
  },
  {
    bg: "bg-lager",
    ink: "text-[#2B2016]",
    body: "text-[#2B2016]/75",
    marker: "text-[#2B2016]/55",
    line: "bg-[#2B2016]/15",
  },
  {
    bg: "bg-marzen",
    ink: "text-[#2B2016]",
    body: "text-[#2B2016]/80",
    marker: "text-[#2B2016]/55",
    line: "bg-[#2B2016]/15",
  },
  {
    bg: "bg-dubbel",
    ink: "text-[#FDFAF1]",
    body: "text-[#F3EDE3]/80",
    marker: "text-lager/90",
    line: "bg-[#F3EDE3]/15",
  },
  {
    bg: "bg-porter",
    ink: "text-[#F3EDE3]",
    body: "text-[#F3EDE3]/75",
    marker: "text-lager",
    line: "bg-[#C89B3C]/25",
  },
];

export function FeatureStack({ features }: { features: StackFeature[] }) {
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cards = cardRefs.current;
        if (window.innerWidth < 768) {
          // Mobile fallback: clear any transforms left from a resize.
          for (const card of cards) {
            if (card) {
              card.style.transform = "";
              card.style.opacity = "";
            }
          }
          return;
        }
        const vh = window.innerHeight;
        const stopY = 0.2 * vh;
        const range = 0.35 * vh;
        // Arrival progress of each card toward its sticky stop.
        const arrivals = cards.map((card) => {
          if (!card) return 0;
          const top = card.getBoundingClientRect().top;
          return smooth(clamp01((stopY + range - top) / range));
        });
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          if (!card) continue;
          let k = 0;
          for (let j = i + 1; j < arrivals.length; j++) k += arrivals[j];
          // Scale only — the top-right transform-origin keeps that corner
          // pinned; left and bottom edges recede inward.
          card.style.transform = `scale(${(1 - k * 0.04).toFixed(4)})`;
          card.style.opacity = String(1 - k * 0.07);
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
    <section className="pb-[20vh]">
      <div className="flex items-center gap-4 mb-16 mx-auto max-w-5xl px-6">
        <span className="h-px flex-1 bg-border" aria-hidden />
        <h2 className="eyebrow text-brass-deep">The modules</h2>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>

      {features.map((feature, i) => {
        const tone = CARD_TONES[i % CARD_TONES.length];
        return (
          // md:contents removes the wrapper from desktop layout so each card's
          // sticky containing block is the whole section (the deck holds).
          <div key={feature.name} className="md:contents">
            {/* hairline separator — mobile list only */}
            {i > 0 && (
              <div className="md:hidden h-px bg-border my-10 mx-5" aria-hidden />
            )}
            <div
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className={cn(
                "md:sticky md:top-[20vh] md:mb-[38vh] last:md:mb-0",
                // Wide sheet: right edge flush with the viewport, a visible
                // margin kept on the left.
                "mx-5 rounded-xl md:mx-0 md:ml-[7vw] md:rounded-l-2xl md:rounded-r-none",
                "border border-border/60 p-8 md:py-14 md:pl-[5vw] md:pr-[7vw] will-change-transform",
                tone.bg,
                tone.ink,
              )}
              style={{ transformOrigin: "top right" }}
            >
              <div className="grid md:grid-cols-[minmax(0,5fr)_1px_minmax(0,6fr)] md:gap-12 lg:gap-16 md:items-start max-w-6xl">
                {/* Left zone: numeral + name, then the display-face motto */}
                <div>
                  <div className="flex items-baseline gap-5">
                    <span className={cn("figures text-5xl md:text-6xl", tone.marker)}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className={cn("eyebrow", tone.ink)}>{feature.name}</h3>
                  </div>
                  <div className={cn("h-px my-6", tone.line)} aria-hidden />
                  <p className="font-display text-3xl md:text-4xl tracking-tight">
                    {feature.motto}
                  </p>
                </div>

                {/* Full-height hairline between the zones */}
                <div className={cn("hidden md:block w-px self-stretch", tone.line)} aria-hidden />

                {/* Right zone: prose description + capability list */}
                <div className="mt-8 md:mt-0">
                  <p className={cn("text-base md:text-lg leading-relaxed", tone.body)}>
                    {feature.description}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {feature.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-baseline gap-3 text-sm md:text-base"
                      >
                        <span className={cn("select-none", tone.marker)} aria-hidden>
                          •
                        </span>
                        <span className={tone.body}>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
