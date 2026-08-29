import type { Metadata } from "next";

import { CapabilitiesSection } from "@/components/landing/capabilities-section";
import { ClosingCta } from "@/components/landing/closing-cta";
import { DemandSection } from "@/components/landing/demand-section";
import { FaqSection } from "@/components/landing/faq-section";
import { InventorySection } from "@/components/landing/inventory-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { NightTimeline } from "@/components/landing/night-timeline";
import { OrderingSection } from "@/components/landing/ordering-section";

export const metadata: Metadata = {
  title: "Crowbar — run the whole service from one screen",
  description:
    "Operations for one venue: bookings and the walk-in queue at the door, QR ordering and ticket boards through service, stock counted down to the pour. Your register stays the payment and fiscal authority.",
};

/**
 * The marketing page, on paper ground.
 *
 * Static. It was `force-dynamic` for a venue carousel that had already stopped
 * being rendered; nothing on this page reads from the API, so it is prerendered
 * and the Railway-private-network caveat that forced dynamic rendering no
 * longer applies.
 *
 * The composition is broken on purpose — §04 of the System canvas. No two
 * consecutive sections share a grid, and the two ink bands cut the paper run
 * rather than decorating it.
 */
export default function Home() {
  return (
    <div className="flex flex-col bg-background text-foreground">
      <LandingHeader />
      <LandingHero />
      <NightTimeline />
      <CapabilitiesSection />
      <OrderingSection />
      <InventorySection />
      <DemandSection />
      <FaqSection />
      <ClosingCta />
      <LandingFooter />
    </div>
  );
}
