import { getCurrentUser } from "@/lib/auth";
import ReservationsClient from "./reservations-client";
import { redirect } from "next/navigation";
import {
  fetchBusinessReservations,
  fetchServiceTypesByBusiness,
  fetchBusinessCustomers,
} from "@/lib/api";

export default async function ReservationsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  const [reservations, serviceTypes, customers] = await Promise.all([
    fetchBusinessReservations(businessId, "confirmed"),
    fetchServiceTypesByBusiness(businessId),
    fetchBusinessCustomers(businessId),
  ]);

  return (
    <ReservationsClient
      businessId={businessId}
      initialReservations={reservations}
      serviceTypes={serviceTypes}
      customers={customers}
    />
  );
}
