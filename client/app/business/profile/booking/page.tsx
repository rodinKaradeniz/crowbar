import {
  fetchBookingSchedules,
  fetchBusiness,
  fetchServiceTypesByBusiness,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessBookingClient from "./business-booking-client";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";

export default async function BusinessBooking() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const [business, serviceTypes, schedules] = await Promise.all([
    fetchBusiness(user.businessId),
    fetchServiceTypesByBusiness(user.businessId),
    fetchBookingSchedules(),
  ]);

  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.RESERVATIONS)) {
    return <ModuleDisabled moduleName="Reservations" />;
  }

  if (!schedules) {
    return (
      <div className="page-container">
        <h1 className="page-title">Booking Configuration</h1>
        <p className="page-description">
          Booking settings could not be loaded. Please try again.
        </p>
      </div>
    );
  }

  return (
    <BusinessBookingClient
      businessId={user.businessId}
      initialBusiness={business}
      serviceTypes={serviceTypes}
      initialSchedules={schedules}
      canEdit={user.role === "owner" || user.role === "manager"}
    />
  );
}
