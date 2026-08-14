import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessOverviewClient from "./business-overview-client";
import {
  fetchBusiness,
  fetchBusinessDashboardStats,
  fetchServiceTypesByBusiness,
} from "@/lib/api";
import { fetchMLDemandForecast } from "@/lib/ml-api";

export default async function BusinessOverview() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const [business, stats, serviceTypes, demandForecast] =
    await Promise.all([
      fetchBusiness(user.businessId),
      fetchBusinessDashboardStats(user.businessId),
      fetchServiceTypesByBusiness(user.businessId),
      fetchMLDemandForecast(),
    ]);

  if (!business || !stats) {
    redirect("/auth/login");
  }

  if (!business.onboardingComplete) {
    redirect("/business/onboarding");
  }

  return (
    <BusinessOverviewClient
      business={business}
      stats={stats}
      serviceTypes={serviceTypes}
      demandForecast={demandForecast}
      docsAssistantEnabled={process.env.DOCS_ASSISTANT_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY)}
    />
  );
}
