import CustomersClient from "./customers-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchBusiness, fetchBusinessVisitors, fetchServiceTypesByBusiness } from "@/lib/api";
import { fetchMLSegmentation } from "@/lib/ml-api";
import { RoleRestricted } from "@/components/role-restricted";
import { hasCapability } from "@/lib/permissions";
import { hasModule, MODULE_KEYS } from "@/lib/modules";

export default async function BusinessCustomers() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  if (!hasCapability(user.role, "customers.view")) {
    return <RoleRestricted surface="Guests" role={user.role} />;
  }

  const businessId = user.businessId;

  // The business comes first because the segment fetch is gated on it: the
  // whole /api/insights router is behind require_module("insights"), so calling
  // it with the module off is a guaranteed 403.
  const business = await fetchBusiness(businessId);

  if (!business) {
    redirect("/auth/login");
  }

  if (!business.onboardingComplete) {
    redirect("/business/onboarding");
  }

  const insightsOn = hasModule(business.enabledModules ?? [], MODULE_KEYS.INSIGHTS);

  const [visitors, serviceTypes, segmentation] = await Promise.all([
    fetchBusinessVisitors(businessId),
    fetchServiceTypesByBusiness(businessId),
    insightsOn ? fetchMLSegmentation() : Promise.resolve(null),
  ]);

  // Build a map of customer_id → segment_label (reservation customers only).
  // A segment is decoration on this page: with Insights off, or the model not
  // yet rebuilt, the badge is simply absent — nothing here claims otherwise.
  const segmentMap: Record<string, string> = {};
  const segments = segmentation?.state === "live" || segmentation?.state === "remembered"
    ? segmentation.data
    : null;
  if (segments?.status === "success" && segments.customer_segments) {
    for (const seg of segments.customer_segments) {
      segmentMap[seg.customer_id] = seg.segment_label;
    }
  }

  return (
    <CustomersClient
      visitors={visitors}
      serviceTypes={serviceTypes}
      customerSegments={segmentMap}
      businessTimezone={business.timezone ?? "UTC"}
    />
  );
}
