import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ModulesSettingsClient from "./modules-settings-client";

export default async function ModulesSettingsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }
  if (user.role === "staff") redirect("/business/overview");

  return <ModulesSettingsClient businessId={user.businessId} />;
}
