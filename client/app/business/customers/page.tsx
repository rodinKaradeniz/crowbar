import CustomersClient from "./customers-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  fetchBusinessCustomers,
  fetchBusinessReservations,
  fetchServiceTypesByBusiness,
} from "@/lib/api";
import { fetchMLSegmentation } from "@/lib/ml-api";

export default async function BusinessCustomers() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  const [customers, reservations, serviceTypes, segmentation] =
    await Promise.all([
      fetchBusinessCustomers(businessId),
      fetchBusinessReservations(businessId),
      fetchServiceTypesByBusiness(businessId),
      fetchMLSegmentation(),
    ]);

  // Build a map of customer_id → segment_label
  const segmentMap: Record<string, string> = {};
  if (segmentation?.status === "success" && segmentation.customer_segments) {
    for (const seg of segmentation.customer_segments) {
      segmentMap[seg.customer_id] = seg.segment_label;
    }
  }

  return (
    <CustomersClient
      businessId={businessId}
      customers={customers}
      reservations={reservations}
      serviceTypes={serviceTypes}
      customerSegments={segmentMap}
    />
  );
}
