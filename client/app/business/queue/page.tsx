import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { QueueBoardClient } from "./queue-board-client";

export default async function QueuePage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }

  return <QueueBoardClient businessId={business.id} businessSlug={business.slug} />;
}
