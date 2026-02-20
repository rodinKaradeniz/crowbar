import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import CustomerAccountSettingsClient from "./customer-account-settings-client";

export default async function CustomerAccountSettings() {
  const user = await getCurrentUser();

  if (!user || user.type !== "customer") {
    redirect("/auth/login");
  }

  return <CustomerAccountSettingsClient userId={user.id} userEmail={user.email} />;
}