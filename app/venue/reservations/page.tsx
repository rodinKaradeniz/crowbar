import { getCurrentUser } from "@/lib/auth";
import ReservationsClient from "./reservations-client";
import { redirect } from "next/navigation";

export default async function ReservationsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const venueId = user.venueId;
  return <ReservationsClient venueId={venueId} />;
}
