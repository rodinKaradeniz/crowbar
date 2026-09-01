"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  clientDownloadReportCsv,
  clientGetPurchasingSpend,
  clientGetStockActivity,
  type PurchasingSpendReport,
  type StockActivityReport,
} from "@/lib/client-api";
import { EmptyState } from "@/components/empty-state";
import { useRegionalSettings } from "@/contexts/regional-context";
import { formatMoney } from "@/lib/money";
import { formatBusinessDate } from "@/lib/business-time";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FigureBand,
  ReportFigure,
  ReportShell,
} from "@/components/reports/report-shell";
import type { ReportRange } from "@/components/reports/report-range";

interface Props {
  range: ReportRange;
}

export function CostPanel({ range }: Props) {
  const { currencyCode, locale, timezone } = useRegionalSettings();
  const money = (value: string) => formatMoney(value, currencyCode, locale);

  const [stock, setStock] = useState<StockActivityReport | null>(null);
  const [purchasing, setPurchasing] = useState<PurchasingSpendReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stockRows, purchasingRows] = await Promise.all([
        clientGetStockActivity(range),
        clientGetPurchasingSpend(range),
      ]);
      setStock(stockRows);
      setPurchasing(purchasingRows);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load these reports");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <ReportShell
        title="Stock movement and waste"
        description="Every movement posted in this range, and what the waste cost."
        range={range}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        complete={stock?.complete ?? true}
        incompleteReason={stock?.incompleteReason}
        disclosure={stock?.disclosure}
        onExport={async () => {
          try {
            await clientDownloadReportCsv("stock", range, "waste.csv");
          } catch {
            toast.error("Could not export the waste report");
          }
        }}
        exportLabel="Export waste CSV"
      >
        {stock && stock.movementsByType.length === 0 ? (
          <EmptyState
            title="No stock movements in this range"
            description="Receiving, pouring, waste and count reconciliation all post movements here."
          />
        ) : (
          stock && (
            <>
              <FigureBand>
                {stock.movementsByType.map((row) => (
                  <ReportFigure
                    key={row.movementType}
                    label={row.movementType.replace("_", " ")}
                    value={row.movements}
                    hint={`${row.quantity} base units`}
                  />
                ))}
                <ReportFigure
                  label="Waste value"
                  value={money(stock.totalWasteValue)}
                  hint={
                    stock.movementsWithoutCost
                      ? `${stock.movementsWithoutCost} movement(s) uncosted`
                      : "All movements carry a cost"
                  }
                />
              </FigureBand>

              {stock.waste.length > 0 && (
                  <Table>
                    <colgroup>
                      <col />
                      <col className="w-[22%]" />
                      <col className="w-[16%]" />
                      <col className="w-[18%]" />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stock.waste.map((row) => (
                        <TableRow key={`${row.itemName}-${row.reason}`}>
                          <TableCell>{row.itemName}</TableCell>
                          <TableCell className="capitalize">
                            {row.reason.replace("_", " ")}
                          </TableCell>
                          <TableCell numeric>{row.quantity}</TableCell>
                          <TableCell numeric>{money(row.wasteValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              )}

              {stock.reconciledCounts.length > 0 && (
                <div>
                  <h3 className="type-label mb-2 text-muted-foreground">Counts reconciled</h3>
                  <ul className="flex flex-col gap-1 text-[length:var(--ui-size)]">
                    {stock.reconciledCounts.map((row) => (
                      <li
                        key={row.sessionId}
                        className="flex justify-between gap-4 border-b pb-1 last:border-0"
                      >
                        <span className="capitalize">
                          {row.kind.replace("_", " ")}
                          {/* Was `new Date(...).toLocaleDateString()`: the
                              browser's clock and the browser's locale, on a
                              report about the venue's own service days. */}
                          {row.reconciledAt
                            ? ` · ${formatBusinessDate(row.reconciledAt, timezone, locale)}`
                            : ""}
                        </span>
                        <span className="font-mono tabular-nums shrink-0">
                          {row.absoluteVariance} variance across {row.lines} lines
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )
        )}
      </ReportShell>

      <ReportShell
        title="Purchasing"
        description="What this venue committed to suppliers, measured at receipt."
        range={range}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        complete={purchasing?.complete ?? true}
        incompleteReason={purchasing?.incompleteReason}
        disclosure={purchasing?.disclosure}
        onExport={async () => {
          try {
            await clientDownloadReportCsv("purchasing", range, "purchasing.csv");
          } catch {
            toast.error("Could not export the purchasing report");
          }
        }}
      >
        {purchasing && purchasing.bySupplier.length === 0 ? (
          <EmptyState
            title="Nothing received in this range"
            description="Purchasing numbers appear once a delivery has been received against an order."
          />
        ) : (
          purchasing && (
            <>
              <FigureBand>
                <ReportFigure
                  label="Received value"
                  value={money(purchasing.totalReceivedValue)}
                  hint="Committed to suppliers"
                />
                <ReportFigure
                  label="Suppliers"
                  value={purchasing.bySupplier.length}
                />
                <ReportFigure
                  label="Lines with a discrepancy"
                  value={purchasing.linesWithDiscrepancies}
                  hint="Received quantity differed from the order"
                />
                {Object.entries(purchasing.ordersByStatus).map(([status, count]) => (
                  <ReportFigure
                    key={status}
                    label={`Orders ${status.replace("_", " ")}`}
                    value={count}
                  />
                ))}
              </FigureBand>

                <Table>
                  <colgroup>
                    <col />
                    <col className="w-[20%]" />
                    <col className="w-[26%]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      {/* "Receipts" read as a fiscal receipt on a reports
                          screen. It means deliveries received against a
                          purchase order. */}
                      <TableHead className="text-right">Deliveries</TableHead>
                      <TableHead className="text-right">Received value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchasing.bySupplier.map((row) => (
                      <TableRow key={row.supplierId}>
                        <TableCell>{row.supplierName}</TableCell>
                        <TableCell numeric>{row.receipts}</TableCell>
                        <TableCell numeric>{money(row.receivedValue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </>
          )
        )}
      </ReportShell>
    </div>
  );
}
