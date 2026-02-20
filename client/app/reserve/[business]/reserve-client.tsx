
import Image from "next/image";
import {
  Mail,
  Phone,
  MapPin,
  GalleryVerticalEnd,
} from "lucide-react";
import { Business, ServiceType } from "@/types";
import { ReservationForm } from "@/components/reservation-form";

interface ReserveClientProps {
    business: Business;
    serviceTypes: ServiceType[];
}
export default function ReserveClient({ business, serviceTypes }: ReserveClientProps) {
  return (
    <div className="flex min-h-screen w-full">
      {/* Left side - Business info with background image */}
      <div className="relative hidden w-1/2 lg:flex">
        <div className="absolute inset-0">
          <Image
            src={business.image || ""}
            alt={business.name}
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
            <h1 className="page-title-xl mb-4">{business.name}</h1>
            {business.description && (
              <p className="text-lg text-white/90 mb-8">{business.description}</p>
            )}
          </div>
          <div className="space-y-4">
            {business.phone && (
              <div className="contact-row">
                <Phone className="contact-icon-lg" />
                <a href={`tel:${business.phone}`} className="hover:underline">
                  {business.phone}
                </a>
              </div>
            )}
            {business.email && (
              <div className="contact-row">
                <Mail className="contact-icon-lg" />
                <a href={`mailto:${business.email}`} className="hover:underline">
                  {business.email}
                </a>
              </div>
            )}
            {business.address && (
              <div className="contact-row">
                <MapPin className="contact-icon-lg" />
                <span>{business.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Reservation form */}
      <div className="flex w-full flex-1 items-center justify-center bg-background lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <h1 className="page-title-lg mb-2">{business.name}</h1>
            {business.description && (
              <p className="text-muted-foreground">{business.description}</p>
            )}
          </div>
          <ReservationForm businessId={business.id} serviceTypes={serviceTypes} />
        </div>
      </div>
    </div>
  );
}
