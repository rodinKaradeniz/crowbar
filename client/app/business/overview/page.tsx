import { redirect } from "next/navigation";

import BusinessOverviewClient from "./business-overview-client";
import {
  fetchBusiness,
  fetchBusinessCustomers,
  fetchBusinessDashboardStats,
  fetchServiceTypesByBusiness,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { fetchMLDemandForecast } from "@/lib/ml-api";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { hasCapability } from "@/lib/permissions";

export default async function BusinessOverview() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  // "Arriving next" needs guest names, and a booking list without them is not
  // worth the space. Not every role may see them: `inventory_operator` holds
  // `overview.view` and not `customers.view`. The fetch is skipped rather than
  // filtered client-side, so the names never reach a browser that may not have
  // them.
  const canSeeGuests = hasCapability(user.role, "customers.view");

  // The business is awaited on its own because the forecast fetch is gated on
  // it. The ENTIRE /api/insights router sits behind require_module("insights"),
  // so with the module off this call was a guaranteed 403 — which mlFetch used
  // to turn into `null`, which ForecastPanel rendered as "Crowbar needs a few
  // weeks of your own service history". That sentence blamed Crowbar's data for
  // the owner's own setting, on the first screen a manager sees.
  const business = await fetchBusiness(user.businessId);

  if (!business) {
    redirect("/auth/login");
  }

  const insightsOn = hasModule(business.enabledModules ?? [], MODULE_KEYS.INSIGHTS);

  const [stats, serviceTypes, demandForecast, customers] = await Promise.all([
    fetchBusinessDashboardStats(user.businessId),
    fetchServiceTypesByBusiness(user.businessId),
    insightsOn ? fetchMLDemandForecast() : Promise.resolve(null),
    canSeeGuests ? fetchBusinessCustomers(user.businessId) : Promise.resolve([]),
  ]);

  if (!stats) {
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
      guestNames={Object.fromEntries(
        (customers ?? [])
          .filter((customer) => Boolean(customer.name))
          .map((customer) => [customer.id, customer.name as string]),
      )}
    />
  );
}
