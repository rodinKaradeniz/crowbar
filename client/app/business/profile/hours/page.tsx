import { fetchBusiness } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessHoursClient from "./business-hours-client";

export default async function BusinessHours() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }
  if (user.role === "staff") redirect("/business/overview");

  const businessId = user.businessId;
  const business = await fetchBusiness(businessId);
  if (!business?.onboardingComplete) redirect("/business/onboarding");

  return <BusinessHoursClient businessId={businessId} initialBusiness={business ?? undefined} />;
}
