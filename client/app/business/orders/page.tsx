import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { TicketBoardClient } from "./ticket-board-client";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { RoleRestricted } from "@/components/role-restricted";
import { hasCapability } from "@/lib/permissions";

export default async function OrdersPage() {
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

  if (!hasCapability(user.role, "orders.view")) {
    return <RoleRestricted surface="Orders" role={user.role} />;
  }

  return <TicketBoardClient businessId={business.id} />;
}
