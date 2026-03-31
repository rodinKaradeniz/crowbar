import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import WidgetSnippetClient from "./widget-snippet-client";

export default async function WidgetSettingsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);

  if (!business) {
    redirect("/auth/login");
  }

  return <WidgetSnippetClient slug={business.slug} />;
}
