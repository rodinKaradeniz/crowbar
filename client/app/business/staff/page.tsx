import StaffClient from "./staff-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchBusiness, fetchBusinessStaff } from "@/lib/api";

export default async function BusinessStaff() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  const [business, staffData] = await Promise.all([
    fetchBusiness(businessId),
    fetchBusinessStaff(businessId),
  ]);

  if (!business) {
    redirect("/auth/login");
  }

  if (!business.onboardingComplete) {
    redirect("/business/onboarding");
  }

  return <StaffClient initialStaff={staffData} />;
}
