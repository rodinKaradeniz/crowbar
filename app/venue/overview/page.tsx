import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import VenueOverviewClient from "./venue-overview-client";

export default async function VenueOverview() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  return <VenueOverviewClient venueId={user.venueId} />;
}
