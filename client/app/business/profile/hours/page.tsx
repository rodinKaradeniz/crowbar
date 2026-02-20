import { fetchBusiness } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessHoursClient from "./business-hours-client";

export default async function BusinessHours() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;
  const business = await fetchBusiness(businessId);

  return <BusinessHoursClient businessId={businessId} initialBusiness={business} />;
}
