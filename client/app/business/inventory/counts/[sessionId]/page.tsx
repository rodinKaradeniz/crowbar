import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { CountSessionClient } from "./count-session-client";
import { hasCapability } from "@/lib/permissions";

export default async function CountSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
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

  const { sessionId } = await params;
  const canManage = hasCapability(user.role, "inventory.counts.manage");

  return (
    <CountSessionClient
      businessId={business.id}
      sessionId={sessionId}
      canManage={canManage}
    />
  );
}
