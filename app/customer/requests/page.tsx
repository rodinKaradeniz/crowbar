import CustomerRequestsClient from "./customer-requests-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CustomerRequests() {
  const user = await getCurrentUser();

  if (!user || user.type !== "customer") {
    redirect("/auth/login");
  }

  const customerId = user.id;
  return <CustomerRequestsClient customerId={customerId} />;
}
