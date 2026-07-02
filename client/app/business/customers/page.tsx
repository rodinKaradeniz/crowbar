import CustomersClient from "./customers-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchBusiness, fetchBusinessVisitors, fetchServiceTypesByBusiness } from "@/lib/api";
import { fetchMLSegmentation } from "@/lib/ml-api";

export default async function BusinessCustomers() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  const [business, visitors, serviceTypes, segmentation] = await Promise.all([
    fetchBusiness(businessId),
    fetchBusinessVisitors(businessId),
    fetchServiceTypesByBusiness(businessId),
    fetchMLSegmentation(),
  ]);

  if (!business) {
    redirect("/auth/login");
  }

  if (!business.onboardingComplete) {
    redirect("/business/onboarding");
  }

  // Build a map of customer_id → segment_label (reservation customers only)
  const segmentMap: Record<string, string> = {};
  if (segmentation?.status === "success" && segmentation.customer_segments) {
    for (const seg of segmentation.customer_segments) {
      segmentMap[seg.customer_id] = seg.segment_label;
    }
  }

  return (
    <CustomersClient
      visitors={visitors}
      serviceTypes={serviceTypes}
      customerSegments={segmentMap}
    />
  );
}
