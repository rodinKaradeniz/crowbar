"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Reveal } from "@/components/reveal";
import { cn } from "@/lib/utils";

/**
 * FAQ section (Phase 2.2). Two columns split by a hairline: the left rail
 * carries an oversized display-italic numeral mirroring the currently-open
 * question (plus an "0X of 0N" caption and the section intro); the right
 * column is the numbered accordion itself, one question open at a time.
 * Answers expand via the CSS grid-rows trick — no JS measurement.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

export function FaqSection({
  eyebrow,
  title,
  intro,
  items,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  items: FaqItem[];
}) {
  // Index shown in the left rail — tracks the last-opened question even if
  // the visitor collapses everything, so the numeral never goes blank.
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [railIndex, setRailIndex] = useState(0);

  const toggle = (i: number) => {
    setOpenIndex((current) => (current === i ? null : i));
    setRailIndex(i);
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-6 grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] gap-14 lg:gap-0">
        {/* Left rail — giant numeral of the active question */}
        <Reveal className="lg:pr-14 lg:sticky lg:top-28 self-start">
          <div className="flex items-baseline gap-4">
            <span
              key={railIndex}
              className="font-display italic text-[6rem] md:text-[8.5rem] leading-none tracking-tight fade-rise"
              aria-hidden
            >
              {pad(railIndex + 1)}
            </span>
            <span className="figures text-xs text-muted-foreground uppercase tracking-widest">
              of {pad(items.length)}
            </span>
          </div>
          <p className="eyebrow text-brass-deep mt-10">{eyebrow}</p>
          <h2 className="font-display text-4xl md:text-5xl mt-3 tracking-tight">
            {title}
          </h2>
          <p className="text-muted-foreground leading-relaxed mt-4 max-w-sm">
            {intro}
          </p>
        </Reveal>

        {/* Right column — numbered accordion, hairline-divided */}
        <Reveal className="lg:border-l lg:border-border lg:pl-14">
          {items.map((item, i) => {
            const open = openIndex === i;
            return (
              <div
                key={item.question}
                className={cn("border-b border-border", i === 0 && "border-t")}
              >
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={open}
                  aria-controls={`faq-answer-${i}`}
                  className="w-full flex items-center gap-6 py-7 text-left group"
                >
                  <span
                    className={cn(
                      "figures text-sm shrink-0 transition-colors",
                      open ? "text-brass-deep" : "text-muted-foreground",
                    )}
                  >
                    {pad(i + 1)}
                  </span>
                  <span className="font-display text-xl md:text-2xl tracking-tight flex-1">
                    {item.question}
                  </span>
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full border border-border/80",
                      "transition-transform duration-300 motion-reduce:transition-none",
                      "group-hover:border-brass",
                      open && "rotate-45",
                    )}
                    aria-hidden
                  >
                    <Plus className="size-4 text-brass-deep" />
                  </span>
                </button>
                <div
                  id={`faq-answer-${i}`}
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="text-muted-foreground leading-relaxed pb-7 pl-11 md:pl-14 max-w-xl">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
