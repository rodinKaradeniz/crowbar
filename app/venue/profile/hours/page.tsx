import { getVenueById } from "@/mock-data";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import VenueHoursClient from "./venue-hours-client";

export default async function VenueHours() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const venueId = user.venueId;
  const venue = getVenueById(venueId);

  return <VenueHoursClient venueId={venueId} initialVenue={venue} />;
}
