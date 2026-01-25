
import Image from "next/image";
import {
  Mail,
  Phone,
  MapPin,
  GalleryVerticalEnd,
} from "lucide-react";
import { Venue } from "@/types";
import { ReservationForm } from "@/components/reservation-form";

interface ReserveClientProps {
    venue: Venue;
}
export default function ReserveClient({ venue }: ReserveClientProps) {
  return (
    <div className="flex min-h-screen w-full">
      {/* Left side - Venue info with background image */}
      <div className="relative hidden w-1/2 lg:flex">
        <div className="absolute inset-0">
          <Image
            src={venue.image || ""}
            alt={venue.name}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-10 text-white">
          <div>
            <a href="/" className="flex items-center gap-2 font-medium">
              <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                <GalleryVerticalEnd className="size-4" />
              </div>
              RK Reservations
            </a>
          </div>

          <div>
            <h1 className="page-title-xl mb-4">{venue.name}</h1>
            {venue.description && (
              <p className="text-lg text-white/90 mb-8">{venue.description}</p>
            )}
          </div>
          <div className="space-y-4">
            {venue.phone && (
              <div className="contact-row">
                <Phone className="contact-icon-lg" />
                <a href={`tel:${venue.phone}`} className="hover:underline">
                  {venue.phone}
                </a>
              </div>
            )}
            {venue.email && (
              <div className="contact-row">
                <Mail className="contact-icon-lg" />
                <a href={`mailto:${venue.email}`} className="hover:underline">
                  {venue.email}
                </a>
              </div>
            )}
            {venue.address && (
              <div className="contact-row">
                <MapPin className="contact-icon-lg" />
                <span>{venue.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Reservation form */}
      <div className="flex w-full flex-1 items-center justify-center bg-background lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <h1 className="page-title-lg mb-2">{venue.name}</h1>
            {venue.description && (
              <p className="text-muted-foreground">{venue.description}</p>
            )}
          </div>
          <ReservationForm venueId={venue.id} />
        </div>
      </div>
    </div>
  );
}
