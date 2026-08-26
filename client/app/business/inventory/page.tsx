import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { InventoryWorkspaceClient } from "./inventory-workspace-client";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { RoleRestricted } from "@/components/role-restricted";
import { hasCapability } from "@/lib/permissions";

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

  if (!hasCapability(user.role, "inventory.view")) {
    return <RoleRestricted surface="Inventory" role={user.role} />;
  }

  return (
    <InventoryWorkspaceClient
      businessId={business.id}
      businessTimezone={business.timezone ?? "UTC"}
      canManageCounts={hasCapability(user.role, "inventory.counts.manage")}
      canManagePurchasing={hasCapability(user.role, "purchasing.suppliers.manage")}
      canApproveOrders={hasCapability(user.role, "purchasing.order.approve")}
      canViewCost={hasCapability(user.role, "inventory.cost.view")}
    />
  );
}
