import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import HappyHourSettingsClient from "./happy-hour-settings-client";
import { RoleRestricted } from "@/components/role-restricted";
import { hasCapability } from "@/lib/permissions";

export default async function HappyHourPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.ORDERING)) {
    return <ModuleDisabled moduleName="Ordering" />;
  }

  if (!hasCapability(user.role, "happyhour.manage")) {
    return <RoleRestricted surface="Happy hour" role={user.role} />;
  }

  return <HappyHourSettingsClient timezone={business.timezone ?? "UTC"} />;
}
