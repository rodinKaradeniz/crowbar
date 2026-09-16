import { getCurrentUser } from "@/lib/auth";
import { ReservationsWorkspaceClient } from "./reservations-workspace-client";
import { redirect } from "next/navigation";
import {
  fetchBusiness,
  fetchBusinessReservations,
  fetchServiceTypesByBusiness,
  fetchBusinessCustomers,
  fetchReservationWaitlist,
} from "@/lib/api";
import { fetchMLSegmentation } from "@/lib/ml-api";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";
import { hasCapability } from "@/lib/permissions";
import { RoleRestricted } from "@/components/role-restricted";

export default async function ReservationsPage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const businessId = user.businessId;

  // The business is awaited first: the segment fetch is gated on the Insights
  // module, and the module/role gates below have to run before any of the rest
  // is rendered anyway.
  const business = await fetchBusiness(businessId);

  if (!business) {
    redirect("/auth/login");
  }
  if (!business.onboardingComplete) redirect("/business/onboarding");

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.RESERVATIONS)) {
    return <ModuleDisabled moduleName="Reservations" />;
  }

  if (!hasCapability(user.role, "reservations.view")) {
    return <RoleRestricted surface="Reservations" role={user.role} />;
  }

  const insightsOn = hasModule(business.enabledModules ?? [], MODULE_KEYS.INSIGHTS);

  // Accepting a request, and every waitlist write, is `reservations.manage` on
  // the server. Those two tabs are hidden — not disabled — for a role without
  // it, which is why the pending and waitlist reads are skipped too.
  const canManage = hasCapability(user.role, "reservations.manage");

  const [reservations, pendingReservations, serviceTypes, customers, waitlistEntries, segmentation] =
    await Promise.all([
      fetchBusinessReservations(businessId, "confirmed"),
      canManage ? fetchBusinessReservations(businessId, "pending") : Promise.resolve([]),
      fetchServiceTypesByBusiness(businessId),
      fetchBusinessCustomers(businessId),
      canManage ? fetchReservationWaitlist() : Promise.resolve([]),
      insightsOn && canManage ? fetchMLSegmentation() : Promise.resolve(null),
    ]);

  // Segment is risk CONTEXT on a request row, not the answer: absent when
  // Insights is off or the model has not been rebuilt, and the row reads the
  // same without it.
  const customerSegments: Record<string, string> = {};
  const segments =
    segmentation?.state === "live" || segmentation?.state === "remembered"
      ? segmentation.data
      : null;
  if (segments?.status === "success" && segments.customer_segments) {
    for (const seg of segments.customer_segments) {
      customerSegments[seg.customer_id] = seg.segment_label;
    }
  }

  return (
    <ReservationsWorkspaceClient
      initialReservations={reservations}
      initialPendingReservations={pendingReservations}
      initialWaitlistEntries={waitlistEntries}
      businessId={businessId}
      serviceTypes={serviceTypes}
      customers={customers}
      customerSegments={customerSegments}
      businessTimezone={business.timezone ?? "UTC"}
      businessMaxGuests={business.maxGuests}
      businessCountryCode={business.countryCode ?? "DE"}
      currentTime={new Date().toISOString()}
      canOverride={hasCapability(user.role, "reservations.override")}
      canManage={canManage}
    />
  );
}
