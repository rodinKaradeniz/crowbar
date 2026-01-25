import CustomersClient from "./customers-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function VenueCustomers() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const venueId = user.venueId;

  return <CustomersClient venueId={venueId} />;
}
