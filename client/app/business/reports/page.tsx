import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { RoleRestricted } from "@/components/role-restricted";
import { hasCapability } from "@/lib/permissions";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { ReportsWorkspaceClient } from "./reports-workspace-client";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user || user.type !== "staff") redirect("/auth/login");

  const business = await fetchBusiness(user.businessId);
  if (!business) redirect("/auth/login");
  if (!business.onboardingComplete) redirect("/business/onboarding");

  // Reporting is not module-gated as a whole — bookings and tables exist for
  // every venue. Individual tabs are gated by the module that owns their data.
  if (!hasCapability(user.role, "reports.service")) {
    return <RoleRestricted surface="Reports" role={user.role} />;
  }

  const enabled = business.enabledModules ?? [];

  return (
    <ReportsWorkspaceClient
      hasQueue={hasModule(enabled, MODULE_KEYS.QUEUE)}
      hasOrdering={hasModule(enabled, MODULE_KEYS.ORDERING)}
      canViewCost={
        hasCapability(user.role, "reports.cost") &&
        hasModule(enabled, MODULE_KEYS.INVENTORY)
      }
      canViewStaffActions={hasCapability(user.role, "reports.staff_actions")}
    />
  );
}
