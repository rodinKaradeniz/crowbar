import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { ModuleDisabled } from "@/components/module-disabled";
import FloorClient from "./floor-client";

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

  return (
    <FloorClient
      businessId={business.id}
      canManage={user.role === "owner" || user.role === "manager"}
      hasReservations={business.enabledModules.includes("reservations")}
      hasQueue={business.enabledModules.includes("queue")}
      businessTimezone={business.timezone ?? "UTC"}
    />
  );
}
