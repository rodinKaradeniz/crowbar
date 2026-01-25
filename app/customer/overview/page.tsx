import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import CustomerOverviewClient from "./customer-overview-client";

export default async function CustomerOverview() {
  const user = await getCurrentUser();

  if (!user || user.type !== "customer") {
    redirect("/auth/login");
  }

  return <CustomerOverviewClient customerId={user.id} customerName={user.name} />;
}
