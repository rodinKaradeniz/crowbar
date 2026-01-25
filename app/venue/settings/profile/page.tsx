import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import VenueProfileSettingsClient from "./venue-profile-settings-client";

export default async function VenueProfileSettings() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  return (
    <VenueProfileSettingsClient
      userId={user.id}
      initialName={user.name}
      initialPhone={user.phone || ""}
      initialAvatar={user.avatar || ""}
    />
  );
}