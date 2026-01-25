import CustomerReservationsClient from "./customer-reservations-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CustomerReservations() {
  const user = await getCurrentUser();

  if (!user || user.type !== "customer") {
    redirect("/auth/login");
  }

  const customerId = user.id;
  return <CustomerReservationsClient customerId={customerId} />;
}
