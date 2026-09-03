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
import { PageBody, PageHeader } from "@/components/page-header";

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
    <>
      {/* The Tabs root wraps the header AND the body: Radix requires TabsList
          and TabsContent under one root, and the list belongs in the pinned
          header so the branch you are on stays visible with the title that
          owns it. `contents` keeps the root out of the layout entirely, so the
          header and body remain the flow siblings that sticky needs. */}
      <Tabs value={tab} onValueChange={setTab} className="contents">
        <PageHeader
          wide
          title="Reports"
          description="Operational records from this venue's own service log. Not accounting or fiscal reports."
        >
          <ReportRangePicker value={range} onChange={setRange} />
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
        </PageHeader>

        <PageBody wide>

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
        </PageBody>
      </Tabs>
    </>
  );
}
