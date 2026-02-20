import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessProfileSettingsClient from "./business-profile-settings-client";

export default async function BusinessProfileSettings() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  return (
    <BusinessProfileSettingsClient
      userId={user.id}
      initialName={user.name}
      initialPhone={user.phone || ""}
      initialAvatar={user.avatar || ""}
    />
  );
}