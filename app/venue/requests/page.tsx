import RequestsClient from "./requests-client";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Requests() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const venueId = user.venueId;
  return <RequestsClient venueId={venueId} />;
}
