import { fetchBusiness } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessInfoClient from "./business-info-client";

export default async function BusinessInfo() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;
  const business = await fetchBusiness(businessId);

  return <BusinessInfoClient businessId={businessId} initialBusiness={business} />;
}
