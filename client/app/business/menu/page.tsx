import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { MenuManagementClient } from "./menu-management-client";

export default async function MenuPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }

  return <MenuManagementClient businessId={business.id} />;
}
