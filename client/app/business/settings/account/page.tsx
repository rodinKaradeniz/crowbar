import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessAccountSettingsClient from "./business-account-settings-client";

export default async function BusinessAccountSettings() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  return (
    <BusinessAccountSettingsClient
      userEmail={user.email}
      businessId={user.businessId}
    />
  );
}
