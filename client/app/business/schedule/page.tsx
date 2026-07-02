import { getCurrentUser } from "@/lib/auth";
import BusinessScheduleClient from "./business-schedule-client";
import { redirect } from "next/navigation";
import {
  fetchBusiness,
  fetchBusinessReservations,
  fetchServiceTypesByBusiness,
  fetchBusinessCustomers,
} from "@/lib/api";

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

  if (!business.onboardingComplete) {
    redirect("/business/onboarding");
  }

  return (
    <BusinessScheduleClient
      business={business}
      initialReservations={reservations}
      serviceTypes={serviceTypes}
      customers={customers}
    />
  );
}
