import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import CustomerOverviewClient from "./customer-overview-client";
import { fetchMyCustomerStats } from "@/lib/api";

export default async function CustomerOverview() {
  const user = await getCurrentUser();

  if (!user || user.type !== "customer") {
    redirect("/auth/login");
  }

  const stats = await fetchMyCustomerStats();

  return (
    <CustomerOverviewClient
      customerId={user.id}
      customerName={user.name}
      initialStats={stats}
    />
  );
}
