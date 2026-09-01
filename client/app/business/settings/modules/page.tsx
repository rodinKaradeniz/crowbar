import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ModulesSettingsClient from "./modules-settings-client";
import { hasCapability } from "@/lib/permissions";
import { RoleRestricted } from "@/components/role-restricted";

export default async function ModulesSettingsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }
  if (!hasCapability(user.role, "business.configure")) {
    return <RoleRestricted surface="Modules" role={user.role} />;
  }

  return <ModulesSettingsClient businessId={user.businessId} />;
}
