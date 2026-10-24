import Link from "next/link";
import Image from "next/image";
import { Mail, Phone, MapPin, Globe } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { useTenantImage } from "@/hooks/use-tenant-image";
import type { Business } from "@/types";
import { collapseOperatingHours } from "@/lib/operating-hours";

/**
 * The ink half of the public reservation page.
 *
 * WHY INK ON A PAPER SURFACE. Grounds are fixed by surface and a public guest
 * page is paper — but this is the same shape the auth screens already are: an
 * ink panel beside a paper form, inside one hairline box (docs/DESIGN.md, "the
 * auth screens are the hinge"). Depicting the other ground is not the same as
 * being on it, which is also how landing §03 carries `.ground-ink` panels. The
 * panel resolves every token against ink, exactly as `AuthPanel` does.
 *
 * WHAT IT REPLACED. A 320–416px hero band whose whole payload was one button,
 * with the venue's contact details and hours pushed below the fold in a
 * separate paper column. The guest deciding whether to book needs the address
 * and the hours *while* they pick a time, not before it.
 *
 * The hours are set with the same ledger rhythm the public menu uses — name
 * left, the gap doing the work leader dots do on paper, figure right and
 * tabular — because a guest who has seen one of these pages should recognise
 * the other.
 */

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[var(--space-12)] flex items-center gap-[var(--space-12)]">
      <h2 className="type-label text-muted-foreground">{children}</h2>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export function VenuePanel({ business }: { business: Business }) {
  const image = useTenantImage(business.image);
  const hours = business.operatingHours ?? {};
  const hasHours = Object.keys(hours).length > 0;

  return (
    // `flex-1` is load-bearing, not defensive. The two columns are equalised by
    // `items-stretch` on the row, which stretches the COLUMN — this panel is a
    // child of that column and sizes to its own content unless told to fill.
    // Without it the ink stopped 175px short of the box on the review step and
    // the split ended in a strip of paper under a dark panel.
    <div className="ground-ink flex flex-1 flex-col bg-background text-foreground">
      {/*
        The venue's own photograph, when it has one. A bounded band rather than
        a full hero: it is the one decorative image anywhere in the product, and
        it is subordinate to the booking. Most venues — the demo tenant
        included — have none, and the panel is complete without it.
      */}
      {image && (
        <div className="relative h-40 w-full shrink-0 overflow-hidden">
          {/* `useTenantImage` returns null for a URL that is unusable or has
              already failed to load, so the band and its gradient disappear
              together and the panel falls back to exactly the no-image state
              described above. A guest never sees a broken frame, and never a
              500. `priority` is deliberately gone: an unoptimized decorative
              image gets no LCP benefit from preloading a URL we do not
              control, and a dead preload only logs a warning. */}
          <Image
            {...image}
            alt=""
            fill
            sizes="(max-width: 900px) 100vw, 40vw"
            className="object-cover"
          />
          {/* Settles the photograph into the ground below it. */}
          <div className="absolute inset-0 bg-linear-to-b from-transparent to-background" />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-[var(--space-32)] p-[var(--space-32)]">
        {/* The target is the element, not the ink: the mark stays 16px and the
            link carries the control floor (34 at a desk, 48 below 1280). */}
        <Link
          href="/"
          className="inline-flex min-h-[var(--control-desktop-min)] w-fit items-center text-foreground hover:text-primary"
        >
          <BrandMark size="sm" />
        </Link>

        <div>
          <h1 className="type-d3">{business.name}</h1>
          {/* What the venue IS, under what it is called. It read as an eyebrow
              above the name, which put the categories before the identity. */}
          {business.tags && business.tags.length > 0 && (
            <p className="type-label mt-[var(--space-12)] text-muted-foreground">
              {business.tags.join("  ·  ")}
            </p>
          )}
          {business.description && (
            <p className="mt-[var(--space-16)] max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
              {business.description}
            </p>
          )}
        </div>

        <section>
          <PanelHeading>Find us</PanelHeading>
          <div className="space-y-[var(--space-12)] text-sm">
            {/* Phone and email are the two things a guest taps here, so they
                are controls on the height ladder rather than links in a line
                of text: a text link cannot clear the 48px tablet floor without
                breaking its line box. The email button may grow taller and
                wrap (`break-all`) so a long address is never cut off. */}
            {(business.phone || business.email) && (
              <div className="flex flex-wrap gap-[var(--space-8)]">
                {business.phone && (
                  <Button asChild variant="secondary" size="md">
                    <a href={`tel:${business.phone}`} className="type-data">
                      <Phone className="text-muted-foreground" aria-hidden />
                      {business.phone}
                    </a>
                  </Button>
                )}
                {business.email && (
                  <Button
                    asChild
                    variant="secondary"
                    size="md"
                    className="h-auto min-h-[var(--control-md)] max-w-full whitespace-normal break-all py-[var(--space-8)] text-left"
                  >
                    <a href={`mailto:${business.email}`}>
                      <Mail className="text-muted-foreground" aria-hidden />
                      {business.email}
                    </a>
                  </Button>
                )}
              </div>
            )}
            {business.website && (
              <div className="flex items-start gap-[var(--space-12)]">
                <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <a
                  href={business.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all hover:text-primary"
                >
                  {business.website}
                </a>
              </div>
            )}
            {business.address && (
              <div className="flex items-start gap-[var(--space-12)]">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{business.address}</span>
              </div>
            )}
          </div>
        </section>

        {hasHours && (
          <section>
            <PanelHeading>Hours</PanelHeading>
            <div className="divide-y divide-border">
              {collapseOperatingHours(hours).map((run) => (
                <div
                  key={run.label}
                  className="flex items-baseline gap-[var(--space-12)] py-[var(--space-8)] text-sm"
                >
                  <span>{run.label}</span>
                  <span className="flex-1" aria-hidden />
                  <span
                    className={
                      run.value === "Closed"
                        ? "shrink-0 text-muted-foreground"
                        : "type-data shrink-0 text-muted-foreground"
                    }
                  >
                    {run.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/*
          The processor line. The venue is the data controller and Crowbar is
          its software processor — the disclosure on the review step says so in
          full, and this is the same fact where the guest first sees the name.
          `mt-auto` pins it to the foot of a panel taller than its content.
        */}
        <p className="mt-auto pt-[var(--space-16)] text-xs text-muted-foreground">
          Bookings for {business.name} are taken through Crowbar, the venue&apos;s
          booking software.
        </p>
      </div>
    </div>
  );
}
