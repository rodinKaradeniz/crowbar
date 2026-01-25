import { getVenueById } from "@/mock-data";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import VenueInfoClient from "./venue-info-client";

export default async function VenueInfo() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const venueId = user.venueId;
  const venue = getVenueById(venueId);

  return <VenueInfoClient venueId={venueId} initialVenue={venue} />;
}
