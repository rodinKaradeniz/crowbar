import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import VenueTypesClient from "./venue-types-client";

export default async function VenueTypes() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  return <VenueTypesClient venueId={user.venueId} />;
}
