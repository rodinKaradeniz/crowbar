import { getCurrentUser } from "@/lib/auth";
import BusinessScheduleClient from "./business-schedule-client";
import { redirect } from "next/navigation";
import {
  fetchBusiness,
  fetchBusinessReservations,
  fetchServiceTypesByBusiness,
  fetchBusinessCustomers,
} from "@/lib/api";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";

export default async function BusinessSchedule() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  const [business, reservations, serviceTypes, customers] = await Promise.all([
    fetchBusiness(businessId),
    fetchBusinessReservations(businessId),
    fetchServiceTypesByBusiness(businessId),
    fetchBusinessCustomers(businessId),
  ]);

  if (!business) {
    redirect("/auth/login");
  }

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.RESERVATIONS)) {
    return <ModuleDisabled moduleName="Reservations" />;
  }

  if (!business.onboardingComplete) {
    redirect("/business/onboarding");
  }

  return (
    <BusinessScheduleClient
      business={business}
      initialReservations={reservations}
      serviceTypes={serviceTypes}
      customers={customers}
      currentTime={new Date().toISOString()}
      canOverride={user.role === "owner" || user.role === "manager"}
    />
  );
}
