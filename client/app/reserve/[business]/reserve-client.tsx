"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Mail,
  Phone,
  MapPin,
  Globe,
  Clock,
  Users,
  CalendarDays,
  GalleryVerticalEnd,
} from "lucide-react";
import { Business, ServiceType } from "@/types";
import { ReservationForm } from "@/components/reservation-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface ReserveClientProps {
  business: Business;
  serviceTypes: ServiceType[];
}

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const ORDERED_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-5">
      <h2 className="eyebrow text-brass">{children}</h2>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export default function ReserveClient({ business, serviceTypes }: ReserveClientProps) {
  const searchParams = useSearchParams();
  const isWidget = searchParams.get("widget") === "1";

  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(undefined);

  function openBooking(serviceId?: string) {
    setSelectedServiceId(serviceId);
    setBookingOpen(true);
  }

  if (!business.publicReservationsEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md">
          <CalendarDays className="mx-auto size-10 text-brass" />
          <p className="eyebrow mt-5 text-brass">Reservations</p>
          <h1 className="mt-2 font-display text-3xl">Online bookings are unavailable</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {business.name} is currently taking reservations directly through the venue.
          </p>
          {business.phone && (
            <Button asChild className="mt-6">
              <a href={`tel:${business.phone}`}><Phone /> Contact {business.name}</a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Widget mode: render booking form only
  if (isWidget) {
    return (
      <div className="p-4">
        <ReservationForm
          businessId={business.id}
          businessTimezone={business.timezone ?? "UTC"}
          businessMaxGuests={business.maxGuests}
          serviceTypes={serviceTypes}
          preselectedServiceTypeId={selectedServiceId}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative h-80 md:h-104 w-full overflow-hidden">
        {business.image ? (
          <Image
            src={business.image}
            alt={business.name}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-ink" />
        )}
        {/* Candlelit dim: settle the photo into the walnut ground */}
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/60 to-transparent" />

        {/* Crowbar branding */}
        <div className="absolute top-4 left-4">
          <Link href="/" className="flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm font-medium">
            <div className="bg-white/15 backdrop-blur-sm flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Crowbar
          </Link>
        </div>

        {/* Hero content */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <div className="max-w-3xl mx-auto text-center fade-rise">
            {business.tags && business.tags.length > 0 && (
              <p className="eyebrow text-brass mb-3">
                {business.tags.join("  ·  ")}
              </p>
            )}
            <h1 className="font-display text-4xl md:text-6xl text-foreground mb-2 tracking-tight">
              {business.name}
            </h1>
            <div className="rule-double mt-5 mx-auto max-w-36" />
            <Button
              size="lg"
              className="mt-6"
              onClick={() => openBooking()}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Book Now
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        {/* About */}
        <section className="fade-rise" style={{ animationDelay: "100ms" }}>
          <SectionHeading>About</SectionHeading>
          <div className="grid md:grid-cols-2 gap-6">
            {business.description && (
              <p className="text-muted-foreground leading-relaxed">{business.description}</p>
            )}
            <div className="space-y-3">
              {business.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-brass shrink-0" />
                  <a href={`tel:${business.phone}`} className="figures hover:text-primary transition-colors">{business.phone}</a>
                </div>
              )}
              {business.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-brass shrink-0" />
                  <a href={`mailto:${business.email}`} className="hover:text-primary transition-colors">{business.email}</a>
                </div>
              )}
              {business.website && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="w-4 h-4 text-brass shrink-0" />
                  <a href={business.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">{business.website}</a>
                </div>
              )}
              {business.address && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-brass shrink-0" />
                  <span>{business.address}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Operating Hours — set like the back page of the menu */}
        {business.operatingHours && Object.keys(business.operatingHours).length > 0 && (
          <section className="fade-rise" style={{ animationDelay: "160ms" }}>
            <SectionHeading>Hours</SectionHeading>
            <div className="max-w-md space-y-2.5">
              {ORDERED_DAYS.filter((d) => d in business.operatingHours).map((day) => {
                const hours = business.operatingHours[day];
                const isClosed = "closed" in hours && hours.closed;
                return (
                  <div key={day} className="flex items-baseline gap-2.5 text-sm">
                    <span className="font-medium">{DAY_LABELS[day] || day}</span>
                    <span className="leader-dots text-brass" aria-hidden />
                    {isClosed ? (
                      <span className="text-muted-foreground">Closed</span>
                    ) : (
                      <span className="figures text-muted-foreground">
                        {"open" in hours ? `${hours.open} – ${hours.close}` : ""}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Services */}
        {serviceTypes.length > 0 && (
          <section className="fade-rise" style={{ animationDelay: "220ms" }}>
            <SectionHeading>Bookings</SectionHeading>
            <div className="grid sm:grid-cols-2 gap-4">
              {serviceTypes.map((st) => (
                <button
                  key={st.id}
                  onClick={() => openBooking(st.id)}
                  className="text-left rounded-lg border bg-card p-5 hover:border-primary/50 transition-colors group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                    <h3 className="font-display text-base group-hover:text-primary transition-colors">{st.name}</h3>
                  </div>
                  {st.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{st.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground figures">
                    {st.duration && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-brass" /> {st.duration} min
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3 h-3 text-brass" /> Up to {st.capacity}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-background/95 backdrop-blur z-40">
        <div className="rule-double" />
        <div className="p-4">
          <Button className="w-full" size="lg" onClick={() => openBooking()}>
            <CalendarDays className="w-4 h-4 mr-2" />
            Book Now
          </Button>
        </div>
      </div>
      <div className="h-24 md:h-0" /> {/* Spacer for sticky bar */}

      {/* Booking Sheet */}
      <Sheet open={bookingOpen} onOpenChange={setBookingOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display text-xl font-normal">Book at {business.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ReservationForm
              businessId={business.id}
              businessTimezone={business.timezone ?? "UTC"}
              businessMaxGuests={business.maxGuests}
              serviceTypes={serviceTypes}
              preselectedServiceTypeId={selectedServiceId}
              onSuccess={() => setBookingOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
