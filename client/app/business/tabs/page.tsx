import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { TabsClient } from "./tabs-client";

export default async function TabsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.ORDERING)) {
    return <ModuleDisabled moduleName="Ordering" />;
  }

  return <TabsClient businessId={business.id} />;
}
