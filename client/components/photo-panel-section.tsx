"use client";

import { useEffect, useRef } from "react";
import Image, { type StaticImageData } from "next/image";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

/**
 * Info sections over ONE shared accent panel (Phase 2.2).
 *
 * <PhotoPanelGroup> renders a single continuous color block (~90% viewport
 * width, lager at the top fading to dubbel at the bottom) spanning the
 * combined height of its child sections — the two per-section panels of
 * Phase 2.1 merged into one layer. The group owns the panel's counter-drift.
 *
 * Each <PhotoPanelSection> keeps the other two scroll layers:
 *   1. the text column scrolls at the normal document rate;
 *   2. the photograph is rendered ~60% taller than its overflow-hidden frame
 *      and translates within it — its motion stays clipped to the frame while
 *      reading as the fastest layer. (Phase 2.2 doubled the visible travel.)
 *
 * Because the copy now sits on the panel, each section declares which end of
 * the gradient it rests on (`on="lager" | "dubbel"`) to pick legible text
 * tones. Per-frame values go straight to refs; prefers-reduced-motion renders
 * all layers static.
 */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function PhotoPanelGroup({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = groupRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // 0 → group top enters at the bottom edge; 1 → bottom exits the top.
        const p = clamp01((vh - rect.top) / (vh + rect.height));
        const centered = p - 0.5;
        if (panelRef.current) {
          panelRef.current.style.transform = `translateY(${(centered * -72).toFixed(1)}px)`;
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
    <div ref={groupRef} className="relative overflow-x-clip">
      {/* One continuous panel behind both sections — lager settling into dubbel */}
      <div
        ref={panelRef}
        className="absolute inset-y-0 left-[5%] right-[5%] will-change-transform bg-linear-to-b from-lager to-dubbel"
        aria-hidden
      />
      <div className="relative">{children}</div>
    </div>
  );
}

interface PhotoPanelSectionProps {
  eyebrow: string;
  title: string;
  body: string;
  /** name → detail rows, set with the signature dot leader */
  rows: Array<[string, string]>;
  photo: StaticImageData;
  photoAlt: string;
  /** which end of the group panel's gradient this section rests on */
  on: "lager" | "dubbel";
  /** graphic on the left on wide screens */
  flip?: boolean;
}

export function PhotoPanelSection({
  eyebrow,
  title,
  body,
  rows,
  photo,
  photoAlt,
  on,
  flip,
}: PhotoPanelSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // 0 → section top enters at the bottom edge; 1 → bottom exits the top.
        const p = clamp01((vh - rect.top) / (vh + rect.height));
        const centered = p - 0.5;
        if (imageRef.current) {
          // The image is 160% frame height (top: -30%); ±14% of its own
          // height (≈±22% of the frame) keeps the doubled travel clipped.
          imageRef.current.style.transform = `translateY(${(centered * -28).toFixed(2)}%)`;
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

  const onDark = on === "dubbel";

  return (
    <section ref={sectionRef} className="py-24 md:py-36 overflow-x-clip">
      <div className="mx-auto max-w-5xl px-6 grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-20 items-center">
        {/* Copy — scrolls at the document rate; tones picked for its gradient end */}
        <Reveal className={flip ? "lg:order-2" : undefined}>
          <p className={cn("eyebrow", onDark ? "text-lager" : "text-[#2B2016]/75")}>
            {eyebrow}
          </p>
          <h2
            className={cn(
              "font-display text-4xl md:text-5xl mt-3 tracking-tight",
              onDark ? "text-[#FDFAF1]" : "text-[#2B2016]",
            )}
          >
            {title}
          </h2>
          <p
            className={cn(
              "leading-relaxed mt-4 max-w-md",
              onDark ? "text-[#F3EDE3]/85" : "text-[#2B2016]/80",
            )}
          >
            {body}
          </p>
          <div className="mt-8 max-w-md space-y-3">
            {rows.map(([name, detail]) => (
              <div
                key={name}
                className={cn(
                  "flex items-baseline gap-2.5 text-sm",
                  onDark ? "text-[#F3EDE3]" : "text-[#2B2016]",
                )}
              >
                <span className="font-medium shrink-0">{name}</span>
                <span
                  className={cn("leader-dots", onDark ? "text-brass" : "text-[#2B2016]/80")}
                  aria-hidden
                />
                <span className={cn("text-right", onDark ? "text-[#F3EDE3]/75" : "text-[#2B2016]/70")}>
                  {detail}
                </span>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Photograph in its clipped frame; the image travels inside it */}
        <div className={cn("relative py-10", flip ? "lg:order-1 pl-10" : "pr-10")}>
          <div
            className={cn(
              "relative w-[88%] aspect-[4/3] overflow-hidden",
              flip ? "ml-auto" : "mr-auto",
            )}
          >
            <div
              ref={imageRef}
              className="absolute inset-x-0 -top-[30%] h-[160%] will-change-transform"
            >
              <Image
                src={photo}
                alt={photoAlt}
                fill
                placeholder="blur"
                sizes="(min-width: 1024px) 40vw, 88vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
