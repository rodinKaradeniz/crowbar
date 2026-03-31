import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { TicketBoardClient } from "./ticket-board-client";

export default async function OrdersPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }

  return <TicketBoardClient businessId={business.id} />;
}
