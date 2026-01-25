"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";

export interface Card {
  src: string;
  title: string;
  category: string;
  content: React.ReactNode;
}

export const CardsCarousel = ({
  items,
  initialScroll = 0,
}: {
  items: React.ReactElement[];
  initialScroll?: number;
}) => {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [scrollX, setScrollX] = useState(initialScroll);

  useEffect(() => {
    if (!carouselRef.current) return;

    const updateScrollPosition = () => {
      if (carouselRef.current) {
        setScrollX(carouselRef.current.scrollLeft);
      }
    };

    updateScrollPosition();
    carouselRef.current.addEventListener("scroll", updateScrollPosition);
    window.addEventListener("resize", updateScrollPosition);

    return () => {
      carouselRef.current?.removeEventListener("scroll", updateScrollPosition);
      window.removeEventListener("resize", updateScrollPosition);
    };
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const scrollAmount = carouselRef.current.clientWidth * 0.7;
    const newScrollLeft =
      direction === "left"
        ? carouselRef.current.scrollLeft - scrollAmount
        : carouselRef.current.scrollLeft + scrollAmount;
    carouselRef.current.scrollTo({ left: newScrollLeft, behavior: "smooth" });
  };

  return (
    <div className="relative w-full">
      <div
        ref={carouselRef}
        className="flex gap-4 overflow-x-scroll scrollbar-hide scroll-smooth snap-x snap-mandatory"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {items.map((item, idx) => (
          <div
            key={idx}
            className="snap-start shrink-0 w-[calc(100%-2rem)] md:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.5rem)]"
          >
            {item}
          </div>
        ))}
      </div>

      {/* Navigation buttons below the carousel */}
      <div className="flex justify-center items-center gap-4 mt-6">
        <button
          onClick={() => scroll("left")}
          className="bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-background transition-all border border-border"
          aria-label="Scroll left"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <button
          onClick={() => scroll("right")}
          className="bg-background/80 backdrop-blur-sm rounded-full p-2 shadow-lg hover:bg-background transition-all border border-border"
          aria-label="Scroll right"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export const BlurImage = ({
  height,
  width,
  src,
  className,
  alt = "Background of a beautiful view",
  ...rest
}: {
  height: number | string;
  width: number | string;
  src: string;
  className?: string;
  alt?: string;
} & Omit<
  React.ComponentProps<typeof Image>,
  "width" | "height" | "src" | "alt"
>) => {
  return (
    <div
      className={cn("relative overflow-hidden rounded-lg", className)}
      style={{ height, width }}
    >
      <Image src={src} alt={alt} fill className="object-cover" {...rest} />
      <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/20 to-transparent" />
    </div>
  );
};

export const VenueCard = ({
  card,
  index,
  layout = false,
  onClick,
}: {
  card: Card;
  index: number;
  layout?: boolean;
  onClick?: () => void;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="relative h-[560px] rounded-lg overflow-hidden group cursor-pointer"
      onClick={onClick}
    >
      <div className="absolute inset-0">
        <BlurImage
          src={card.src}
          alt={card.title}
          width="100%"
          height="100%"
          className="transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
        <div className="mb-2">
          <span className="text-xs uppercase tracking-wider opacity-90">
            {card.category}
          </span>
        </div>
        <h3 className="text-2xl font-bold mb-2">{card.title}</h3>
        <div className="text-sm opacity-90">{card.content}</div>
      </div>
    </motion.div>
  );
};
