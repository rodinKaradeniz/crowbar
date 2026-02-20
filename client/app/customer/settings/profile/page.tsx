import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import CustomerProfileSettingsClient from "./customer-profile-settings-client";

export default async function CustomerProfileSettings() {
  const user = await getCurrentUser();

  if (!user || user.type !== "customer") {
    redirect("/auth/login");
  }

  return (
    <CustomerProfileSettingsClient
      userId={user.id}
      initialName={user.name}
      initialPhone={user.phone || ""}
      initialAvatar={user.avatar || ""}
    />
  );
}