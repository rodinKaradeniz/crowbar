"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  clientDownloadReportCsv,
  clientGetStationThroughput,
  clientGetTabValue,
  type StationThroughputReport,
  type TabValueReport,
} from "@/lib/client-api";
import { EmptyState } from "@/components/empty-state";
import { useRegionalSettings } from "@/contexts/regional-context";
import { formatMoney } from "@/lib/money";
import {
  FigureBand,
  ReportFigure,
  ReportShell,
} from "@/components/reports/report-shell";
import type { ReportRange } from "@/components/reports/report-range";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  range: ReportRange;
}

export function ValuePanel({ range }: Props) {
  const { currencyCode, locale } = useRegionalSettings();
  const money = (value: string) => formatMoney(value, currencyCode, locale);

  const [value, setValue] = useState<TabValueReport | null>(null);
  const [stations, setStations] = useState<StationThroughputReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [valueRow, stationRows] = await Promise.all([
        clientGetTabValue(range),
        clientGetStationThroughput(range),
      ]);
      setValue(valueRow);
      setStations(stationRows);
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
        title="Ordered, open and externally settled"
        description="Three separate figures. They are not added together."
        range={range}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        complete={value?.complete ?? true}
        incompleteReason={value?.incompleteReason}
        disclosure={value?.disclosure}
        onExport={async () => {
          try {
            await clientDownloadReportCsv("value", range, "order-value.csv");
          } catch {
            toast.error("Could not export these numbers");
          }
        }}
      >
        {value && (
          <>
            <FigureBand>
              <ReportFigure
                label="Ordered value"
                value={money(value.orderedValue)}
                hint={`${value.orders} order${value.orders === 1 ? "" : "s"} placed`}
              />
              <ReportFigure
                label="Open-tab value"
                value={money(value.openTabValue)}
                hint={`${value.openTabs} tab${value.openTabs === 1 ? "" : "s"} still open`}
              />
              <ReportFigure
                label="Externally settled value"
                value={money(value.externallySettledValue)}
                hint={`${value.settlements} settled at the venue's register`}
              />
            </FigureBand>

            {/* Rendered verbatim from the server. This wording is the product
                constraint, not decoration — see docs/PRODUCT.md. */}
            <p className="border-l-2 border-border-strong bg-secondary p-[var(--space-12)] text-[length:var(--ui-size)] text-muted-foreground">
              {value.valueDisclosure}
            </p>

            {value.settlementMethods.length > 0 && (
              <>
                <Table>
                  <colgroup>
                    <col />
                    <col className="w-[18%]" />
                    <col className="w-[30%]" />
                  </colgroup>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recorded method</TableHead>
                      <TableHead className="text-right">Settlements</TableHead>
                      <TableHead className="text-right">
                        Externally settled value
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {value.settlementMethods.map((row) => (
                      <TableRow key={row.informationalMethod}>
                        <TableCell className="capitalize">
                          {row.informationalMethod}
                        </TableCell>
                        <TableCell numeric>{row.settlements}</TableCell>
                        <TableCell numeric>
                          {money(row.externallySettledValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-[length:var(--ui-size)] text-muted-foreground">
                  The method is what staff recorded for their own reference. Crowbar
                  does not process payments and holds no tender, card or receipt data.
                </p>
              </>
            )}
          </>
        )}
      </ReportShell>

      <ReportShell
        title="Stations and ticket timing"
        description="What each station made, and how long its tickets took from received to ready."
        range={range}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        complete={stations?.complete ?? true}
        incompleteReason={stations?.incompleteReason}
        disclosure={stations?.disclosure}
        onExport={async () => {
          try {
            await clientDownloadReportCsv("stations", range, "stations.csv");
          } catch {
            toast.error("Could not export station throughput");
          }
        }}
      >
        {stations && stations.stations.length === 0 ? (
          <EmptyState
            title="No orders in this range"
            description="Station throughput appears once orders have been placed and routed."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {stations?.stations.map((station) => (
              <div key={station.station} className="border-t border-border pt-[var(--space-16)]">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium">{station.station}</h3>
                  <div className="type-label text-muted-foreground">
                    <span className="font-mono tabular-nums">{station.quantity}</span> items across{" "}
                    <span className="font-mono tabular-nums">{station.lines}</span> lines
                    {station.averageTicketMinutes != null ? (
                      <>
                        {" · "}
                        <span className="font-mono tabular-nums">{station.averageTicketMinutes}</span>{" "}
                        min average ticket
                      </>
                    ) : (
                      " · no ticket time yet"
                    )}
                  </div>
                </div>
                <ul className="mt-3 flex flex-col gap-1 text-[length:var(--ui-size)]">
                  {station.items.slice(0, 10).map((item) => (
                    <li
                      key={item.itemName}
                      className="flex justify-between gap-4 border-b pb-1 last:border-0"
                    >
                      <span className="truncate">{item.itemName}</span>
                      <span className="font-mono tabular-nums shrink-0">{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </ReportShell>
    </div>
  );
}
