"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Coins, Package, UserCog, Utensils } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_RANGE,
  ReportRangePicker,
  type ReportRange,
} from "@/components/reports/report-range";
import { ServicePanel } from "@/components/reports/service-panel";
import { ValuePanel } from "@/components/reports/value-panel";
import { CostPanel } from "@/components/reports/cost-panel";
import { StaffActionsPanel } from "@/components/reports/staff-actions-panel";

interface Props {
  hasQueue: boolean;
  hasOrdering: boolean;
  canViewCost: boolean;
  canViewStaffActions: boolean;
}

export function ReportsWorkspaceClient({
  hasQueue,
  hasOrdering,
  canViewCost,
  canViewStaffActions,
}: Props) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");

  const available = [
    "service",
    ...(hasOrdering ? ["value"] : []),
    ...(canViewCost ? ["cost"] : []),
    ...(canViewStaffActions ? ["staff"] : []),
  ];
  const [tab, setTab] = useState(
    requested && available.includes(requested) ? requested : "service",
  );

  // One range drives every panel, so two numbers on screen always cover the
  // same period. Changing it re-fetches whichever panel is open.
  const [range, setRange] = useState<ReportRange>(DEFAULT_RANGE);

  return (
    <div className="flex flex-col gap-6 px-[clamp(16px,2.5vw,32px)] py-6">
      <div>
        <h1 className="type-t1">Reports</h1>
        <p className="mt-0.5 text-[length:var(--ui-size)] text-muted-foreground">
          Operational records from this venue&apos;s own service log. Not accounting or
          fiscal reports.
        </p>
      </div>

      <ReportRangePicker value={range} onChange={setRange} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="service">
            <Utensils className="mr-1.5 h-4 w-4" />
            Service
          </TabsTrigger>
          {hasOrdering && (
            <TabsTrigger value="value">
              <Coins className="mr-1.5 h-4 w-4" />
              Orders and tabs
            </TabsTrigger>
          )}
          {canViewCost && (
            <TabsTrigger value="cost">
              <Package className="mr-1.5 h-4 w-4" />
              Stock and purchasing
            </TabsTrigger>
          )}
          {canViewStaffActions && (
            <TabsTrigger value="staff">
              <UserCog className="mr-1.5 h-4 w-4" />
              Staff actions
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="service" className="mt-6">
          <ServicePanel range={range} hasQueue={hasQueue} />
        </TabsContent>

        {hasOrdering && (
          <TabsContent value="value" className="mt-6">
            <ValuePanel range={range} />
          </TabsContent>
        )}

        {canViewCost && (
          <TabsContent value="cost" className="mt-6">
            <CostPanel range={range} />
          </TabsContent>
        )}

        {canViewStaffActions && (
          <TabsContent value="staff" className="mt-6">
            <StaffActionsPanel range={range} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
