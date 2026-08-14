import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { InventoryManagementClient } from "./inventory-management-client";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";

export default async function InventoryPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.INVENTORY)) {
    return <ModuleDisabled moduleName="Inventory" />;
  }

  return <InventoryManagementClient businessId={business.id} businessTimezone={business.timezone ?? "UTC"} />;
}
