"use client";

import Link from "next/link";
import { GalleryVerticalEnd } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingModal } from "@/components/pricing-modal";

export function LandingNavbar() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b bg-background/80 backdrop-blur-sm">
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
            Log in
          </Link>
          <Button asChild size="sm">
            <Link href="/auth/register">Get Started</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
