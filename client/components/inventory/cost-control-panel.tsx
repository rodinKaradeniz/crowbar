"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, TrendingUp } from "lucide-react";

import {
  clientGetControllableCogs,
  clientGetCostControl,
  clientGetConsumptionVariance,
  clientGetMenuMargins,
} from "@/lib/client-api";
import type {
  ControllableCogs,
  ConsumptionVariance,
  CostControlOverview,
  MenuMargins,
} from "@/types";
import { useRegionalSettings } from "@/contexts/regional-context";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import {
  DEFAULT_RANGE,
  RangeCaption,
  ReportRangePicker,
  type ReportRange,
} from "@/components/reports/report-range";

interface Props {
  businessId: string;
}

export function CostControlPanel({ businessId }: Props) {
  const { currencyCode, locale } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);

  const [overview, setOverview] = useState<CostControlOverview | null>(null);
  const [margins, setMargins] = useState<MenuMargins | null>(null);
  const [variance, setVariance] = useState<ConsumptionVariance | null>(null);
  const [cogs, setCogs] = useState<ControllableCogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Variance and COGS are the two windowed figures here. This panel used to
  // hard-code 28 days, which docs/TODO.md recorded as the main operator
  // complaint about the analytics surfaces; it now uses the same picker the
  // Reports page does.
  const [range, setRange] = useState<ReportRange>(DEFAULT_RANGE);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = range;
    try {
      const [overviewRow, marginRows, varianceRows, cogsRow] = await Promise.all([
        clientGetCostControl(businessId),
        clientGetMenuMargins(businessId),
        clientGetConsumptionVariance(businessId, start, end),
        clientGetControllableCogs(businessId, start, end),
      ]);
      setOverview(overviewRow);
      setMargins(marginRows);
      setVariance(varianceRows);
      setCogs(cogsRow);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load cost figures");
    } finally {
      setLoading(false);
    }
  }, [businessId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading cost control…</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!overview) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No cost figures yet"
        description="Receive a purchase order so stock has a cost basis to report from."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="section-title">Cost control</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Stock on hand and margins are current. Variance and COGS cover the range
          below.
        </p>
        <RangeCaption range={range} />
      </div>

      <ReportRangePicker value={range} onChange={setRange} />

      {/* The disclosure is rendered verbatim: these are operational estimates,
          not accounting output. */}
      <div className="flex items-start gap-2 rounded-lg border border-brass/40 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{overview.disclosure}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <div className="eyebrow">Stock on hand</div>
          <div className="figures text-2xl mt-1">{money(overview.valuation.totalValue)}</div>
          {!overview.valuation.complete && (
            <div className="text-xs text-muted-foreground mt-1">
              Excludes {overview.valuation.itemsWithoutCost.length} item
              {overview.valuation.itemsWithoutCost.length === 1 ? "" : "s"} with no cost:{" "}
              {overview.valuation.itemsWithoutCost.join(", ")}
            </div>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <div className="eyebrow">Cost of stock sold</div>
          <div className="figures text-2xl mt-1">{cogs ? money(cogs.soldCost) : "—"}</div>
          {cogs && !cogs.complete && (
            <div className="text-xs text-muted-foreground mt-1">
              {cogs.movementsWithoutCost} movement
              {cogs.movementsWithoutCost === 1 ? "" : "s"} had no cost recorded.
            </div>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <div className="eyebrow">Waste</div>
          <div className="figures text-2xl mt-1">{cogs ? money(cogs.wasteCost) : "—"}</div>
        </div>
      </div>

      {/* Reorder suggestions with every term of the formula on screen. */}
      <div className="flex flex-col gap-2">
        <h3 className="section-subtitle">Reorder suggestions</h3>
        {overview.reorderSuggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is below its par level once stock on order is counted.
          </p>
        ) : (
          overview.reorderSuggestions.map((suggestion) => (
            <div key={suggestion.itemId} className="rounded-lg border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{suggestion.itemName}</div>
                  <div className="text-xs text-muted-foreground">
                    {suggestion.explanation.formula}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="figures text-lg">
                    {suggestion.suggestedQuantity} {suggestion.baseUnit}
                  </div>
                  {!suggestion.explanation.leadTimeKnown && (
                    <Badge variant="outline" className="text-muted-foreground mt-1">
                      No lead time
                    </Badge>
                  )}
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                {[
                  ["Par", suggestion.explanation.parQuantity],
                  ["On hand", suggestion.explanation.onHand],
                  ["On order", suggestion.explanation.outstandingOnOrder],
                  ["Used per day", suggestion.explanation.averageConsumedPerDay],
                  [
                    "Lead time",
                    suggestion.explanation.leadTimeKnown
                      ? `${suggestion.explanation.leadTimeDays} days`
                      : "Unknown",
                  ],
                  ["Target", suggestion.explanation.targetQuantity],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between gap-2 leader-dots">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="figures">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        )}
      </div>

      {/* Margins */}
      <div className="flex flex-col gap-2">
        <h3 className="section-subtitle">Menu margin and pour cost</h3>
        {!margins || margins.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No menu items to cost yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {margins.items.map((row) => (
              <div
                key={row.menuItemId}
                className="flex items-center gap-3 rounded-lg border px-4 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{row.menuItemName}</div>
                  {!row.complete && (
                    <div className="text-xs text-muted-foreground">{row.incompleteReason}</div>
                  )}
                </div>
                <div className="figures text-sm text-muted-foreground shrink-0">
                  {money(row.price)}
                </div>
                <div className="figures text-sm shrink-0 w-20 text-right">
                  {row.pourCostPercent === null ? "—" : `${row.pourCostPercent}%`}
                </div>
                <div className="figures text-sm shrink-0 w-24 text-right">
                  {row.grossMargin === null ? "Unknown" : money(row.grossMargin)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Waste and variance */}
      <div className="flex flex-col gap-2">
        <h3 className="section-subtitle">Consumption and waste</h3>
        {!variance || variance.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No stock has been sold or wasted in this window.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {variance.items.map((row) => (
              <div key={row.itemId} className="flex items-center gap-3 rounded-lg border px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{row.name}</div>
                  {row.wasteByReason.length > 0 && (
                    <div className="text-xs text-muted-foreground truncate">
                      {row.wasteByReason
                        .map((w) => `${w.reason}: ${w.quantity} ${row.baseUnit}`)
                        .join(" · ")}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="figures text-sm">
                    {row.soldQuantity} {row.baseUnit} sold
                  </div>
                  <div className="figures text-xs text-muted-foreground">
                    {row.wasteValue === null ? "Waste uncosted" : `${money(row.wasteValue)} wasted`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
