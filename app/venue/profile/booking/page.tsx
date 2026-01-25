import { getVenueById } from "@/mock-data";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import VenueBookingClient from "./venue-booking-client";

export default async function VenueBooking() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const venueId = user.venueId;
  const venue = getVenueById(venueId);

  return <VenueBookingClient venueId={venueId} initialVenue={venue} />;
}
