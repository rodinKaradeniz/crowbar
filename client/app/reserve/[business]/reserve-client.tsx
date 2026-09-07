"use client";

import { useSearchParams } from "next/navigation";
import { Phone } from "lucide-react";

import { Business, ServiceType } from "@/types";
import { ReservationForm } from "@/components/reservation-form";
import { VenuePanel } from "@/components/reservation/venue-panel";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

interface ReserveClientProps {
  business: Business;
  serviceTypes: ServiceType[];
}

/**
 * The public reservation page: one hairline box, an ink venue panel beside a
 * paper booking column.
 *
 * WHAT THIS REPLACED. A 320–416px ink hero whose entire payload was one "Book
 * Now" button, a paper document below it repeating the venue's details, and a
 * 400px side panel that the button opened and that carried the actual booking
 * four screens at a time. The first screen a guest saw asked them to open a
 * second surface before they could do anything.
 *
 * The split is the shape the auth screens already are — `AuthSplit`, "an ink
 * panel beside a paper form" — applied to the third surface that wants it. The
 * ink is a `.ground-ink` subtree inside a paper page, exactly as landing §03
 * carries the bar board and the tab; grounds stay fixed by surface, and a
 * public guest page is still paper.
 *
 * BELOW THE BREAKPOINT THE PANEL STACKS UNDER THE FORM, and that is a
 * deliberate divergence from `AuthSplit`, which drops its panel entirely. The
 * auth panel is pure marketing and someone opening /auth/login on a phone is
 * staff starting a shift. This panel carries the address, the phone number and
 * the hours — the things a guest deciding whether to book actually needs — so
 * it follows the booking rather than disappearing.
 */
export default function ReserveClient({ business, serviceTypes }: ReserveClientProps) {
  const searchParams = useSearchParams();
  const isWidget = searchParams.get("widget") === "1";

  // Widget mode is the form embedded in the venue's own site. No panel, no
  // shell, no Crowbar lockup — the surrounding page is the venue's.
  if (isWidget) {
    return (
      <div className="p-[var(--space-16)]">
        <ReservationForm
          businessId={business.id}
          businessTimezone={business.timezone ?? "UTC"}
          businessMaxGuests={business.maxGuests}
          serviceTypes={serviceTypes}
        />
      </div>
    );
  }

  if (!business.publicReservationsEnabled) {
    return (
      <main className="flex min-h-svh flex-col bg-paper-tint p-[var(--space-24)]">
        <BrandMark size="sm" />
        <div className="m-auto w-full max-w-md text-center">
          <p className="type-label text-muted-foreground">Reservations</p>
          <h1 className="type-t1 mt-[var(--space-8)]">
            Online bookings are unavailable
          </h1>
          <div className="mx-auto mt-[var(--space-16)] max-w-36 border-t border-border" />
          <p className="mt-[var(--space-16)] text-sm leading-relaxed text-muted-foreground">
            {business.name} is currently taking reservations directly through
            the venue.
          </p>
          {business.phone && (
            <Button asChild className="mt-[var(--space-24)]">
              <a href={`tel:${business.phone}`}>
                <Phone /> Contact {business.name}
              </a>
            </Button>
          )}
        </div>
      </main>
    );
  }

  return (
    // `--grid-workspace` is the declared Document width — the measure for a
    // surface that is read and filled in, which is what a booking form is.
    // 1100px would have matched `AuthPage`, but that is a literal the token
    // block never declared, and copying it would spread the drift rather than
    // stop it.
    <main className="flex min-h-svh bg-paper-tint p-[var(--space-24)]">
      {/* `m-auto` rather than `justify-center`: a box taller than the viewport
          still scrolls to its own top, which centring would cut off. */}
      <div className="m-auto w-full max-w-[var(--grid-workspace)]">
        {/*
          ROW-REVERSE, AND IT IS DOING REAL WORK. The booking is what the guest
          came for, so it is first in the DOM — first for a screen reader, first
          in tab order, and first when the columns stack. Reversing the row puts
          it back on the RIGHT while both columns fit on one line, and a wrapped
          reversed row still lays its lines out top to bottom, so the panel
          lands underneath. That is the whole stacking rule with no breakpoint
          to keep in sync with the flex bases that decide when it happens.

          `items-stretch` is what makes the ink column run the full height of
          the booking beside it rather than stopping under its own last line.
        */}
        <div className="flex flex-row-reverse flex-wrap items-stretch border border-ink bg-paper">
          <div className="flex min-w-[min(100%,320px)] flex-[1_1_460px] flex-col justify-center p-[var(--space-32)]">
            <ReservationForm
              businessId={business.id}
              businessTimezone={business.timezone ?? "UTC"}
              businessMaxGuests={business.maxGuests}
              serviceTypes={serviceTypes}
            />
          </div>

          <div className="flex min-w-[min(100%,300px)] flex-[1_1_380px] flex-col">
            <VenuePanel business={business} />
          </div>
        </div>
      </div>
    </main>
  );
}
