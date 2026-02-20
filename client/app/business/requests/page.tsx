import RequestsClient from "./requests-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  fetchBusinessReservations,
  fetchServiceTypesByBusiness,
  fetchBusinessCustomers,
} from "@/lib/api";
import { fetchMLSegmentation } from "@/lib/ml-api";

export default async function Requests() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  const [reservations, serviceTypes, customers, segmentation] =
    await Promise.all([
      fetchBusinessReservations(businessId, "pending"),
      fetchServiceTypesByBusiness(businessId),
      fetchBusinessCustomers(businessId),
      fetchMLSegmentation(),
    ]);

  // Build a map of customer_id → segment_label for risk context
  const customerSegments: Record<string, string> = {};
  if (segmentation?.status === "success" && segmentation.customer_segments) {
    for (const seg of segmentation.customer_segments) {
      customerSegments[seg.customer_id] = seg.segment_label;
    }
  }

  return (
    <RequestsClient
      businessId={businessId}
      initialReservations={reservations}
      serviceTypes={serviceTypes}
      customers={customers}
      customerSegments={customerSegments}
    />
  );
}
