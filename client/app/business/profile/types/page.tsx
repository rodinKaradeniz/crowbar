import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import BusinessTypesClient from "./business-types-client";
import { fetchServiceTypesByBusiness } from "@/lib/api";

export default async function BusinessTypes() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const serviceTypes = await fetchServiceTypesByBusiness(user.businessId);

  return (
    <BusinessTypesClient
      businessId={user.businessId}
      initialServiceTypes={serviceTypes}
    />
  );
}
