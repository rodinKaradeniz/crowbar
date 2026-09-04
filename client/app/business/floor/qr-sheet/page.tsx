import { redirect } from "next/navigation";

import { ModuleDisabled } from "@/components/module-disabled";
import { RoleRestricted } from "@/components/role-restricted";
import { fetchBusiness } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { hasCapability } from "@/lib/permissions";
import QrSheetClient from "./qr-sheet-client";

/**
 * Gated exactly like the floor page it is reached from, with one difference:
 * `floor.configure`, not `floor.view`. Handing out the codes that let guests
 * order is a setup action, and it is the capability the endpoint behind this
 * page already required for a single table.
 */
export default async function TableQrSheetPage() {
  const user = await getCurrentUser();
  if (!user || user.type !== "staff") redirect("/auth/login");

  const business = await fetchBusiness(user.businessId);
  if (!business) redirect("/auth/login");
  if (!business.onboardingComplete) redirect("/business/onboarding");

  const hasOperationalModule = ["reservations", "queue", "ordering"].some((module) =>
    business.enabledModules.includes(module),
  );
  if (!hasOperationalModule) return <ModuleDisabled moduleName="Floor" />;

  if (!hasCapability(user.role, "floor.configure")) {
    return <RoleRestricted surface="Table QR codes" role={user.role} />;
  }

  return <QrSheetClient />;
}
