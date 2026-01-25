import StaffClient from "./staff-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function VenueStaff() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const venueId = user.venueId;

  return <StaffClient venueId={venueId} />;
}
