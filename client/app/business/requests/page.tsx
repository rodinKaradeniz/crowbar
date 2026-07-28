import RequestsClient from "./requests-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  fetchBusiness,
  fetchBusinessReservations,
  fetchServiceTypesByBusiness,
  fetchBusinessCustomers,
} from "@/lib/api";
import { fetchMLSegmentation } from "@/lib/ml-api";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";

export default async function Requests() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  const [business, reservations, serviceTypes, customers, segmentation] =
    await Promise.all([
      fetchBusiness(businessId),
      fetchBusinessReservations(businessId, "pending"),
      fetchServiceTypesByBusiness(businessId),
      fetchBusinessCustomers(businessId),
      fetchMLSegmentation(),
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

  // Build a map of customer_id → segment_label for risk context
  const customerSegments: Record<string, string> = {};
  if (segmentation?.status === "success" && segmentation.customer_segments) {
    for (const seg of segmentation.customer_segments) {
      customerSegments[seg.customer_id] = seg.segment_label;
    }
  }

  return (
    <RequestsClient
      initialReservations={reservations}
      serviceTypes={serviceTypes}
      customers={customers}
      customerSegments={customerSegments}
      businessTimezone={business.timezone ?? "UTC"}
      businessMaxGuests={business.maxGuests}
      currentTime={new Date().toISOString()}
      canOverride={user.role === "owner" || user.role === "manager"}
    />
  );
}
