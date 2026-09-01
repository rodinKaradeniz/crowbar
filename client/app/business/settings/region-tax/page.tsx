import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { RegionTaxSettingsClient } from "./region-tax-settings-client";
import { hasCapability } from "@/lib/permissions";
import { RoleRestricted } from "@/components/role-restricted";

export default async function RegionTaxSettingsPage() {
  const user = await getCurrentUser();
  if (!user || user.type !== "staff") redirect("/auth/login");
  const business = await fetchBusiness(user.businessId);
  if (!business) redirect("/auth/login");
  if (!business.onboardingComplete) redirect("/business/onboarding");
  if (!hasCapability(user.role, "business.configure")) {
    return <RoleRestricted surface="Region and tax" role={user.role} />;
  }
  return <RegionTaxSettingsClient business={business} />;
}
