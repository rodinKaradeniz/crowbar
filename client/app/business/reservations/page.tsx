import { getCurrentUser } from "@/lib/auth";
import ReservationsClient from "./reservations-client";
import { redirect } from "next/navigation";
import {
  fetchBusiness,
  fetchBusinessReservations,
  fetchServiceTypesByBusiness,
  fetchBusinessCustomers,
  fetchReservationWaitlist,
} from "@/lib/api";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";

export default async function ReservationsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  const [business, reservations, serviceTypes, customers, waitlistEntries] = await Promise.all([
    fetchBusiness(businessId),
    fetchBusinessReservations(businessId, "confirmed"),
    fetchServiceTypesByBusiness(businessId),
    fetchBusinessCustomers(businessId),
    fetchReservationWaitlist(),
  ]);

  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.RESERVATIONS)) {
    return <ModuleDisabled moduleName="Reservations" />;
  }

  return (
    <ReservationsClient
      initialReservations={reservations}
      initialWaitlistEntries={waitlistEntries}
      businessId={businessId}
      serviceTypes={serviceTypes}
      customers={customers}
      businessTimezone={business.timezone ?? "UTC"}
      businessMaxGuests={business.maxGuests}
      currentTime={new Date().toISOString()}
      canOverride={user.role === "owner" || user.role === "manager"}
    />
  );
}
