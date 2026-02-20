import StaffClient from "./staff-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchBusinessStaff } from "@/lib/api";

export default async function BusinessStaff() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;
  const staffData = await fetchBusinessStaff(businessId);

  return <StaffClient businessId={businessId} initialStaff={staffData} />;
}
