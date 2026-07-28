import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessTypesClient from "./business-types-client";
import { fetchBusiness, fetchServiceTypesByBusiness } from "@/lib/api";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";

export default async function BusinessTypes() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const [business, serviceTypes] = await Promise.all([
    fetchBusiness(user.businessId),
    fetchServiceTypesByBusiness(user.businessId),
  ]);

  if (!business) {
    redirect("/auth/login");
  }

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.RESERVATIONS)) {
    return <ModuleDisabled moduleName="Reservations" />;
  }

  return (
    <BusinessTypesClient
      businessId={user.businessId}
      initialServiceTypes={serviceTypes}
      canEdit={user.role === "owner" || user.role === "manager"}
    />
  );
}
