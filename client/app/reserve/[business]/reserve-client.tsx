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
  Star,
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
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

const ORDERED_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function ReserveClient({ business, serviceTypes }: ReserveClientProps) {
  const searchParams = useSearchParams();
  const isWidget = searchParams.get("widget") === "1";

  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>(undefined);

  function openBooking(serviceId?: string) {
    setSelectedServiceId(serviceId);
    setBookingOpen(true);
  }

  // Widget mode: render booking form only
  if (isWidget) {
    return (
      <div className="p-4">
        <ReservationForm
          businessId={business.id}
          serviceTypes={serviceTypes}
          preselectedServiceTypeId={selectedServiceId}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative h-72 md:h-96 w-full overflow-hidden">
        {business.image ? (
          <Image
            src={business.image}
            alt={business.name}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 bg-linear-to-br from-primary/80 via-primary/60 to-primary/40" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/30 to-transparent" />

        {/* Crowbar branding */}
        <div className="absolute top-4 left-4">
          <Link href="/" className="flex items-center gap-2 text-white/90 hover:text-white transition-colors text-sm font-medium">
            <div className="bg-white/20 backdrop-blur-sm flex size-6 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Crowbar
          </Link>
        </div>

        {/* Hero content */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
          <div className="max-w-4xl mx-auto">
            {business.tags && business.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {business.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white backdrop-blur-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-2">{business.name}</h1>
            <Button
              size="lg"
              className="mt-4"
              onClick={() => openBooking()}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Book Now
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        {/* About */}
        <section>
          <h2 className="text-xl font-semibold mb-4">About</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {business.description && (
              <p className="text-muted-foreground leading-relaxed">{business.description}</p>
            )}
            <div className="space-y-3">
              {business.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${business.phone}`} className="hover:underline">{business.phone}</a>
                </div>
              )}
              {business.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`mailto:${business.email}`} className="hover:underline">{business.email}</a>
                </div>
              )}
              {business.website && (
                <div className="flex items-center gap-3 text-sm">
                  <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={business.website} target="_blank" rel="noopener noreferrer" className="hover:underline">{business.website}</a>
                </div>
              )}
              {business.address && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>{business.address}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Operating Hours */}
        {business.operatingHours && Object.keys(business.operatingHours).length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Hours</h2>
            <div className="rounded-lg border overflow-hidden">
              {ORDERED_DAYS.filter((d) => d in business.operatingHours).map((day) => {
                const hours = business.operatingHours[day];
                const isClosed = "closed" in hours && hours.closed;
                return (
                  <div
                    key={day}
                    className="flex items-center justify-between px-4 py-3 border-b last:border-b-0 text-sm"
                  >
                    <span className="font-medium w-24">{DAY_LABELS[day] || day}</span>
                    {isClosed ? (
                      <span className="text-muted-foreground">Closed</span>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{"open" in hours ? `${hours.open} – ${hours.close}` : ""}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Services */}
        {serviceTypes.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Services</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {serviceTypes.map((st) => (
                <button
                  key={st.id}
                  onClick={() => openBooking(st.id)}
                  className="text-left rounded-lg border p-4 bg-card hover:shadow-md hover:border-primary/50 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                      <h3 className="font-medium text-sm group-hover:text-primary transition-colors">{st.name}</h3>
                    </div>
                  </div>
                  {st.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{st.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {st.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {st.duration} min
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> Up to {st.capacity}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Reviews placeholder */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Reviews</h2>
          <div className="rounded-lg border p-8 text-center bg-muted/30">
            <Star className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="font-medium mb-1">No reviews yet</h3>
            <p className="text-sm text-muted-foreground">Be the first to leave a review after your visit.</p>
          </div>
        </section>
      </div>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-background border-t p-4 z-40">
        <Button className="w-full" size="lg" onClick={() => openBooking()}>
          <CalendarDays className="w-4 h-4 mr-2" />
          Book Now
        </Button>
      </div>
      <div className="h-24 md:h-0" /> {/* Spacer for sticky bar */}

      {/* Booking Sheet */}
      <Sheet open={bookingOpen} onOpenChange={setBookingOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Book at {business.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ReservationForm
              businessId={business.id}
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
