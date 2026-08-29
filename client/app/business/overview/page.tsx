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

  const [business, stats, serviceTypes, demandForecast, customers] =
    await Promise.all([
      fetchBusiness(user.businessId),
      fetchBusinessDashboardStats(user.businessId),
      fetchServiceTypesByBusiness(user.businessId),
      fetchMLDemandForecast(),
      canSeeGuests ? fetchBusinessCustomers(user.businessId) : Promise.resolve([]),
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
      guestNames={Object.fromEntries(
        (customers ?? [])
          .filter((customer) => Boolean(customer.name))
          .map((customer) => [customer.id, customer.name as string]),
      )}
    />
  );
}
