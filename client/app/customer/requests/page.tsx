import CustomerRequestsClient from "./customer-requests-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchMyReservations } from "@/lib/api";

export default async function CustomerRequests() {
  const user = await getCurrentUser();

  if (!user || user.type !== "customer") {
    redirect("/auth/login");
  }

  const allReservations = await fetchMyReservations();
  const pendingReservations = allReservations.filter(
    (r) => r.status === "pending"
  );

  return <CustomerRequestsClient reservations={pendingReservations} />;
}
