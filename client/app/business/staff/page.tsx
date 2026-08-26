import StaffClient from "./staff-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchBusiness, fetchBusinessStaff } from "@/lib/api";
import { RoleRestricted } from "@/components/role-restricted";
import { hasCapability } from "@/lib/permissions";

export default async function BusinessStaff() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  if (!hasCapability(user.role, "staff.view")) {
    return <RoleRestricted surface="Staff" role={user.role} />;
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

  return (
    <StaffClient
      initialStaff={staffData}
      currentUserId={user.id}
      currentRole={user.role}
    />
  );
}
