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
import { hasCapability } from "@/lib/permissions";

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
      <div className="flex flex-col gap-6 px-[clamp(16px,2.5vw,32px)] py-6">
        <h1 className="type-t1">Booking Configuration</h1>
        <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">
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
      canEdit={hasCapability(user.role, "reservations.configure")}
    />
  );
}
