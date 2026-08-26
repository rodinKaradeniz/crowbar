import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { ModuleDisabled } from "@/components/module-disabled";
import FloorClient from "./floor-client";
import { hasCapability } from "@/lib/permissions";
import { RoleRestricted } from "@/components/role-restricted";

export default async function FloorPage() {
  const user = await getCurrentUser();
  if (!user || user.type !== "staff") redirect("/auth/login");

  const business = await fetchBusiness(user.businessId);
  if (!business) redirect("/auth/login");
  if (!business.onboardingComplete) redirect("/business/onboarding");
  const hasOperationalModule = ["reservations", "queue", "ordering"].some((module) =>
    business.enabledModules.includes(module),
  );
  if (!hasOperationalModule) return <ModuleDisabled moduleName="Floor" />;

  if (!hasCapability(user.role, "floor.view")) {
    return <RoleRestricted surface="Floor" role={user.role} />;
  }

  return (
    <FloorClient
      businessId={business.id}
      canManage={hasCapability(user.role, "floor.configure")}
      hasReservations={business.enabledModules.includes("reservations")}
      hasQueue={business.enabledModules.includes("queue")}
      businessTimezone={business.timezone ?? "UTC"}
    />
  );
}
