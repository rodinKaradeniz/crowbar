import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import InsightsClient from "./insights-client";
import {
  fetchMLSegmentation,
  fetchMLCancellation,
  fetchMLDemandForecast,
  fetchMLStatus,
} from "@/lib/ml-api";

export default async function InsightsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const [status, segmentation, cancellation, demandForecast] =
    await Promise.all([
      fetchMLStatus(),
      fetchMLSegmentation(),
      fetchMLCancellation(),
      fetchMLDemandForecast(),
    ]);

  return (
    <InsightsClient
      status={status}
      segmentation={segmentation}
      cancellation={cancellation}
      demandForecast={demandForecast}
    />
  );
}
