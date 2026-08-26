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
    <div className="page-container">
      <div>
        <h1 className="page-title">Inventory</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Stock, purchasing and cost control from one ledger.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
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

        <TabsContent value="stock" className="mt-6">
          <InventoryManagementClient
            businessId={businessId}
            businessTimezone={businessTimezone}
            embedded
          />
        </TabsContent>

        <TabsContent value="counts" className="mt-6">
          <CountsPanel
            businessId={businessId}
            businessTimezone={businessTimezone}
            canManage={canManageCounts}
          />
        </TabsContent>

        {canManagePurchasing && (
          <TabsContent value="suppliers" className="mt-6">
            <SuppliersPanel businessId={businessId} canManage={canManagePurchasing} />
          </TabsContent>
        )}

        {canManagePurchasing && (
          <TabsContent value="orders" className="mt-6">
            <PurchaseOrdersPanel
              businessId={businessId}
              canManage={canManagePurchasing}
              canApprove={canApproveOrders}
            />
          </TabsContent>
        )}

        {canViewCost && (
          <TabsContent value="cost" className="mt-6">
            <CostControlPanel businessId={businessId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
