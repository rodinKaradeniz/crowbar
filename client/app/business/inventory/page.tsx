import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { InventoryManagementClient } from "./inventory-management-client";

export default async function InventoryPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }

  return <InventoryManagementClient businessId={business.id} />;
}
