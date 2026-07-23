"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GalleryVerticalEnd } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingModal } from "@/components/pricing-modal";
import { cn } from "@/lib/utils";

export function LandingNavbar() {
  // Auto-hiding header: slides away on scroll-down, returns on scroll-up,
  // and never hides near the top of the page.
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (y < 80) {
          setHidden(false);
        } else if (delta > 4) {
          setHidden(true);
        } else if (delta < -4) {
          setHidden(false);
        }
        lastY.current = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <header
      className={cn(
        "fixed top-0 inset-x-0 z-50 border-b bg-background/80 backdrop-blur-sm",
        "transition-transform duration-300 motion-reduce:transition-none",
        hidden && "-translate-y-full",
      )}
    >
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <GalleryVerticalEnd className="size-4" />
          </div>
          Crowbar
        </Link>

        <div className="flex items-center gap-4">
          <PricingModal>
            <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </button>
          </PricingModal>
          <Link
            href="/auth/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Login
          </Link>
          <Button asChild size="sm">
            <Link href="/auth/register">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
