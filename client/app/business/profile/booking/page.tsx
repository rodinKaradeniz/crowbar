import { fetchBusiness } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessBookingClient from "./business-booking-client";

export default async function BusinessBooking() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;
  const business = await fetchBusiness(businessId);

  return <BusinessBookingClient businessId={businessId} initialBusiness={business ?? undefined} />;
}
