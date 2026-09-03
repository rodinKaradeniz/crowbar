"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, ClipboardCheck, ClipboardList, Package, TrendingUp } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InventoryManagementClient } from "./inventory-management-client";
import { SuppliersPanel } from "@/components/inventory/suppliers-panel";
import { PurchaseOrdersPanel } from "@/components/inventory/purchase-orders-panel";
import { CountsPanel } from "@/components/inventory/counts-panel";
import { CostControlPanel } from "@/components/inventory/cost-control-panel";
import { PageBody, PageHeader } from "@/components/page-header";

interface Props {
  businessId: string;
  businessTimezone: string;
  /** Open, cancel and reconcile count sessions — not just walk one. */
  canManageCounts: boolean;
  /** Supplier and supplier-product records, and drafting purchase orders. */
  canManagePurchasing: boolean;
  /** Approving an order commits the venue's money, so it is separate. */
  canApproveOrders: boolean;
  /** Valuation, margin, variance and COGS. Manager information. */
  canViewCost: boolean;
}

export function InventoryWorkspaceClient({
  businessId,
  businessTimezone,
  canManageCounts,
  canManagePurchasing,
  canApproveOrders,
  canViewCost,
}: Props) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");

  // A deep link to a tab this role cannot open falls back to Stock rather than
  // rendering an empty panel. The backend enforces the same boundary.
  const available = [
    "stock",
    "counts",
    ...(canManagePurchasing ? ["suppliers", "orders"] : []),
    ...(canViewCost ? ["cost"] : []),
  ];
  const [tab, setTab] = useState(
    requested && available.includes(requested) ? requested : "stock",
  );

  return (
    <>
      {/* The Tabs root wraps the header AND the body: Radix requires TabsList
          and TabsContent under one root, and Stock / Counts / Suppliers is
          this page's own navigation — it belongs beside the title, pinned, not
          scrolled away above a table of rows that could belong to any screen.
          `contents` keeps the root out of the layout so the header and body
          stay the flow siblings that sticky needs. */}
      <Tabs value={tab} onValueChange={setTab} className="contents">
        <PageHeader
          wide
          title="Inventory"
          description="Stock, purchasing and cost control from one ledger."
        >
          <TabsList>
            <TabsTrigger value="stock">
              <Package className="h-4 w-4 mr-1.5" />
              Stock
            </TabsTrigger>
            <TabsTrigger value="counts">
              <ClipboardCheck className="h-4 w-4 mr-1.5" />
              Counts
            </TabsTrigger>
            {canManagePurchasing && (
              <TabsTrigger value="suppliers">
                <Building2 className="h-4 w-4 mr-1.5" />
                Suppliers
              </TabsTrigger>
            )}
            {canManagePurchasing && (
              <TabsTrigger value="orders">
                <ClipboardList className="h-4 w-4 mr-1.5" />
                Purchase orders
              </TabsTrigger>
            )}
            {canViewCost && (
              <TabsTrigger value="cost">
                <TrendingUp className="h-4 w-4 mr-1.5" />
                Cost control
              </TabsTrigger>
            )}
          </TabsList>
        </PageHeader>

        <PageBody wide>

        <TabsContent value="stock">
          <InventoryManagementClient
            businessId={businessId}
            businessTimezone={businessTimezone}
            embedded
          />
        </TabsContent>

        <TabsContent value="counts">
          <CountsPanel
            businessId={businessId}
            businessTimezone={businessTimezone}
            canManage={canManageCounts}
          />
        </TabsContent>

        {canManagePurchasing && (
          <TabsContent value="suppliers">
            <SuppliersPanel businessId={businessId} canManage={canManagePurchasing} />
          </TabsContent>
        )}

        {canManagePurchasing && (
          <TabsContent value="orders">
            <PurchaseOrdersPanel
              businessId={businessId}
              canManage={canManagePurchasing}
              canApprove={canApproveOrders}
            />
          </TabsContent>
        )}

        {canViewCost && (
          <TabsContent value="cost">
            <CostControlPanel businessId={businessId} />
          </TabsContent>
        )}
        </PageBody>
      </Tabs>
    </>
  );
}
