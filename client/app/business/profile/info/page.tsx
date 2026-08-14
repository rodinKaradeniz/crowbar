import { fetchBusiness } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessInfoClient from "./business-info-client";

export default async function BusinessInfo() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }
  if (user.role === "staff") redirect("/business/overview");

  const businessId = user.businessId;
  const business = await fetchBusiness(businessId);
  if (!business?.onboardingComplete) redirect("/business/onboarding");

  return <BusinessInfoClient businessId={businessId} initialBusiness={business ?? undefined} />;
}
