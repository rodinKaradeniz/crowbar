import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ModulesSettingsClient from "./modules-settings-client";
import { hasCapability } from "@/lib/permissions";

export default async function ModulesSettingsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }
  if (!hasCapability(user.role, "business.configure")) redirect("/business/overview");

  return <ModulesSettingsClient businessId={user.businessId} />;
}
