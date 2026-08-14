import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import GuestProfileClient from "./guest-profile-client";

export default async function GuestProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.type !== "staff") redirect("/auth/login");
  const business = await fetchBusiness(user.businessId);
  if (!business) redirect("/auth/login");
  if (!business.onboardingComplete) redirect("/business/onboarding");
  const { customerId } = await params;
  return <GuestProfileClient customerId={customerId} canManage={user.role !== "staff"} businessTimezone={business.timezone ?? "UTC"} />;
}
