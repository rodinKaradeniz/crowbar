import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { QueueBoardClient } from "./queue-board-client";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { hasCapability } from "@/lib/permissions";
import { RoleRestricted } from "@/components/role-restricted";

export default async function QueuePage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.QUEUE)) {
    return <ModuleDisabled moduleName="Queue" />;
  }

  if (!hasCapability(user.role, "queue.view")) {
    return <RoleRestricted surface="Queue" role={user.role} />;
  }

  return (
    <QueueBoardClient
      businessId={business.id}
      businessSlug={business.slug}
      canOverride={hasCapability(user.role, "queue.configure")}
    />
  );
}
