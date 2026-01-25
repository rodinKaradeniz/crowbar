import { getCurrentUser } from "@/lib/auth";
import VenueScheduleClient from "./venue-schedule-client";
import { redirect } from "next/navigation";

export default async function VenueSchedule() {
  const user = await getCurrentUser();
  
  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const venueId = user.venueId;
  return <VenueScheduleClient venueId={venueId} />;
}
