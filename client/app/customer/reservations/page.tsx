import CustomerReservationsClient from "./customer-reservations-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchMyReservations } from "@/lib/api";

export default async function CustomerReservations() {
  const user = await getCurrentUser();

  if (!user || user.type !== "customer") {
    redirect("/auth/login");
  }

  const allReservations = await fetchMyReservations();
  const confirmedReservations = allReservations.filter(
    (r) => r.status === "confirmed"
  );

  return <CustomerReservationsClient reservations={confirmedReservations} />;
}
