import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import GuestProfileClient from "./guest-profile-client";

export default async function GuestProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.type !== "staff") redirect("/auth/login");
  const { customerId } = await params;
  return <GuestProfileClient customerId={customerId} canManage={user.role !== "staff"} />;
}
