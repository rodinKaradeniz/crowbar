import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import InsightsClient from "./insights-client";
import {
  fetchMLSegmentation,
  fetchMLCancellation,
  fetchMLDemandForecast,
  fetchMLStatus,
} from "@/lib/ml-api";
import { fetchBusiness, fetchBusinessKpis, fetchHighRiskReservations } from "@/lib/api";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { RoleRestricted } from "@/components/role-restricted";
import { hasCapability } from "@/lib/permissions";

export default async function InsightsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.INSIGHTS)) {
    return <ModuleDisabled moduleName="Insights" />;
  }

  if (!hasCapability(user.role, "insights.view")) {
    return <RoleRestricted surface="Insights" role={user.role} />;
  }

  const [status, segmentation, cancellation, demandForecast, rawKpis, rawHighRisk] =
    await Promise.all([
      fetchMLStatus(),
      fetchMLSegmentation(),
      fetchMLCancellation(),
      fetchMLDemandForecast(),
      fetchBusinessKpis(user.businessId),
      fetchHighRiskReservations(user.businessId),
    ]);

  return (
    <InsightsClient
      status={status}
      segmentation={segmentation}
      cancellation={cancellation}
      demandForecast={demandForecast}
      rawKpis={rawKpis}
      rawHighRisk={rawHighRisk}
      businessTimezone={business.timezone ?? "UTC"}
    />
  );
}
