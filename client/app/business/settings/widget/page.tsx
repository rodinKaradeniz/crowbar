import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import WidgetSnippetClient from "./widget-snippet-client";
import { hasCapability } from "@/lib/permissions";
import { RoleRestricted } from "@/components/role-restricted";

export default async function WidgetSettingsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }
  if (!hasCapability(user.role, "business.configure")) {
    return <RoleRestricted surface="Booking widget" role={user.role} />;
  }

  const business = await fetchBusiness(user.businessId);

  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  return <WidgetSnippetClient slug={business.slug} />;
}
