import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { RegionTaxSettingsClient } from "./region-tax-settings-client";

export default async function RegionTaxSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.type !== "staff") redirect("/auth/login");
  const business = await fetchBusiness(user.businessId);
  if (!business) redirect("/auth/login");
  if (!business.onboardingComplete) redirect("/business/onboarding");
  if (user.role === "staff") redirect("/business/settings/profile");
  return <RegionTaxSettingsClient business={business} />;
}
