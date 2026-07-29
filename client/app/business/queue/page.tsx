import { getCurrentUser } from "@/lib/auth";
import { fetchBusiness } from "@/lib/api";
import { redirect } from "next/navigation";
import { QueueBoardClient } from "./queue-board-client";
import { ModuleDisabled } from "@/components/module-disabled";
import { hasModule, MODULE_KEYS } from "@/lib/modules";

export default async function QueuePage() {
  const user = await getCurrentUser();

  if (!user || user.type !== "staff") {
    redirect("/auth/login");
  }

  const business = await fetchBusiness(user.businessId);
  if (!business) {
    redirect("/auth/login");
  }

  if (!hasModule(business.enabledModules ?? [], MODULE_KEYS.QUEUE)) {
    return <ModuleDisabled moduleName="Queue" />;
  }

  return (
    <QueueBoardClient
      businessId={business.id}
      businessSlug={business.slug}
      canOverride={user.role === "owner" || user.role === "manager"}
    />
  );
}
