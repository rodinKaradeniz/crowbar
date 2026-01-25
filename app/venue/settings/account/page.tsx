import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import VenueAccountSettingsClient from "./venue-account-settings-client";

export default async function VenueAccountSettings() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  return <VenueAccountSettingsClient userId={user.id} userEmail={user.email} />;
}