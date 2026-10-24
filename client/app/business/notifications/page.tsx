import { redirect } from "next/navigation";

import { RoleRestricted } from "@/components/role-restricted";
import { fetchBusiness } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import { NotificationsClient } from "./notifications-client";

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  if (!hasCapability(user.role, "overview.view")) {
    return <RoleRestricted surface="Notifications" role={user.role} />;
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  return (
    <NotificationsClient
      timezone={business.timezone ?? "UTC"}
      locale={business.locale}
      canCompletePrivacy={hasCapability(user.role, "customers.privacy")}
    />
  );
}
