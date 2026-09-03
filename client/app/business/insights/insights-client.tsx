"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRegionalSettings } from "@/contexts/regional-context";
import {
  BrainCircuit,
  RefreshCw,
  TrendingUp,
  Users,
  AlertTriangle,
  BarChart3,
  Info,
  Activity,
  Package,
  ShoppingCart,
  CalendarClock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { seriesVar } from "@/lib/series-palette";
import { PageBody, PageHeader } from "@/components/page-header";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  MLSegmentationResult,
  MLCancellationResult,
  MLDemandForecastResult,
  MLStatusResponse,
} from "@/lib/ml-api";

interface InsightsClientProps {
  status: MLStatusResponse | null;
  segmentation: MLSegmentationResult | null;
  cancellation: MLCancellationResult | null;
  demandForecast: MLDemandForecastResult | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawKpis: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawHighRisk: any[];
  businessTimezone: string;
}

/**
 * Guest segments are IDENTITY, not rank. `docs/DESIGN.md` classifies a guest
 * segment as neutral -- "a visit frequency has no deadline at all" -- so these
 * are the five declared categorical slots, assigned in fixed order.
 *
 * They used to be green for "champions" and red for "lost": brand green
 * meaning "good news about a number", and the critical fill on a guest who has
 * not been in for a while. Both are named misuses of the rank.
 */
const SEGMENT_COLORS: Record<string, string> = {
  champions: seriesVar(1),
  loyal: seriesVar(2),
  at_risk: seriesVar(3),
  new: seriesVar(4),
  lost: seriesVar(5),
};

const SEGMENT_ICONS: Record<string, string> = {
  champions: "⭐",
  loyal: "💚",
  at_risk: "⚠️",
  new: "🆕",
  lost: "💤",
};

export default function InsightsClient({
  status,
  segmentation,
  cancellation,
  demandForecast,
  rawKpis,
  rawHighRisk,
  businessTimezone,
}: InsightsClientProps) {
  const { locale } = useRegionalSettings();
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  const hasData = status?.status === "ok";
  const lastRun = status?.latest_run;

  const handleRunPipeline = async () => {
    setIsRunning(true);
    try {
      const response = await fetch("/api/proxy/insights/run", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to run insights pipeline");
      }
      router.refresh();
    } catch {
      // ML service unavailable
    } finally {
      setIsRunning(false);
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString(locale, {
      timeZone: businessTimezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <>
      <PageHeader
        wide
        title={
          <span className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6" />
            Insights
          </span>
        }
        description="ML-powered analytics and predictions for your business"
        actions={
          <>
            {lastRun && (
              <span className="text-xs text-muted-foreground">
                Last updated: {formatTimestamp(lastRun.timestamp)}
              </span>
            )}
            <Button
              onClick={handleRunPipeline}
              disabled={isRunning}
              size="filter"
            >
              <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
              {isRunning ? "Running..." : "Run Pipeline"}
            </Button>
          </>
        }
      />

      <PageBody wide>
        {/* No data state */}
        {!hasData && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BrainCircuit className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="type-t2 mb-2">No insights yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                Run the ML pipeline to generate demand forecasts from operational
                reservation data.
              </p>
              <Button onClick={handleRunPipeline} disabled={isRunning}>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden />
                {isRunning ? "Running Pipeline..." : "Run Pipeline"}
              </Button>
            </CardContent>
          </Card>
        )}

        {hasData && (
          <>
            {/* Section 1: Demand Forecast */}
            <DemandForecastSection demandForecast={demandForecast} locale={locale} />

            {/* Section 2: Customer Segmentation + Cancellation side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SegmentationSection segmentation={segmentation} />
              <CancellationSection
                cancellation={cancellation}
                highRiskReservations={rawHighRisk ?? []}
                businessTimezone={businessTimezone}
                locale={locale}
              />
            </div>

            {/* Section 3: Operational KPIs */}
            {rawKpis && <OperationalKpisSection kpis={rawKpis} />}
          </>
        )}
      </PageBody>
    </>
  );
}

// ─── Demand Forecast Section ────────────────────────────────────────────────

function DemandForecastSection({
  demandForecast,
  locale,
}: {
  demandForecast: MLDemandForecastResult | null;
  locale: string;
}) {
  if (!demandForecast || demandForecast.status !== "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            7-Day Demand Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Not enough data to generate a demand forecast yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const forecasts = demandForecast.forecasts || {};
  const businessNames = Object.keys(forecasts);

  // Aggregate all businesses or show the first one
  const allForecasts = businessNames.flatMap((name) =>
    (forecasts[name] || []).map((f) => ({
      ...f,
      business: name,
      day: new Date(`${f.date}T12:00:00Z`).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }),
    }))
  );

  // Group by date for a combined view
  const dateMap = new Map<
    string,
    { date: string; day: string; total: number; is_weekend: number }
  >();
  allForecasts.forEach((f) => {
    const existing = dateMap.get(f.date);
    if (existing) {
      existing.total += f.predicted_reservations;
    } else {
      dateMap.set(f.date, {
        date: f.date,
        day: f.day,
        total: f.predicted_reservations,
        is_weekend: f.is_weekend,
      });
    }
  });

  const chartData = Array.from(dateMap.values()).map((d) => ({
    day: d.day,
    reservations: Math.round(d.total * 10) / 10,
    fill: d.is_weekend ? seriesVar(2) : seriesVar(1),
  }));

  const totalPredicted = chartData.reduce((sum, d) => sum + d.reservations, 0);
  const busiestDay = chartData.reduce(
    (max, d) => (d.reservations > max.reservations ? d : max),
    chartData[0]
  );
  const quietestDay = chartData.reduce(
    (min, d) => (d.reservations < min.reservations ? d : min),
    chartData[0]
  );
  const weekendAvg =
    chartData.filter((d) => ["Fri", "Sat", "Sun"].includes(d.day)).reduce((s, d) => s + d.reservations, 0) /
    Math.max(chartData.filter((d) => ["Fri", "Sat", "Sun"].includes(d.day)).length, 1);
  const weekdayAvg =
    chartData.filter((d) => !["Fri", "Sat", "Sun"].includes(d.day)).reduce((s, d) => s + d.reservations, 0) /
    Math.max(chartData.filter((d) => !["Fri", "Sat", "Sun"].includes(d.day)).length, 1);

  const chartConfig: ChartConfig = {
    reservations: { label: "Predicted Reservations", color: seriesVar(1) },
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          7-Day Demand Forecast
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  Predicted reservation volume for the next 7 days using gradient
                  boosting on historical patterns, day-of-week effects, and
                  rolling demand averages.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Chart */}
          <div className="md:col-span-2">
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="reservations" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <div
                  className="size-2.5 rounded-[var(--radius-2)]"
                  style={{ backgroundColor: seriesVar(1) }}
                />
                Weekday
              </span>
              <span className="flex items-center gap-1">
                <div
                  className="size-2.5 rounded-[var(--radius-2)]"
                  style={{ backgroundColor: seriesVar(2) }}
                />
                Weekend
              </span>
            </div>
          </div>

          {/* Quick stats */}
          <div className="space-y-3">
            <div className="p-3 border bg-muted/30">
              <p className="text-xs text-muted-foreground">Total Expected</p>
              <p className="type-t1">
                {Math.round(totalPredicted)}
              </p>
              <p className="text-xs text-muted-foreground">reservations</p>
            </div>
            {busiestDay && (
              <div className="p-3 border bg-muted/30">
                <p className="text-xs text-muted-foreground">Busiest Day</p>
                <p className="text-sm font-medium">
                  {busiestDay.day} ({Math.round(busiestDay.reservations)})
                </p>
              </div>
            )}
            {quietestDay && (
              <div className="p-3 border bg-muted/30">
                <p className="text-xs text-muted-foreground">Quietest Day</p>
                <p className="text-sm font-medium">
                  {quietestDay.day} ({Math.round(quietestDay.reservations)})
                </p>
              </div>
            )}
            <div className="p-3 border bg-muted/30">
              <p className="text-xs text-muted-foreground">Avg / Day</p>
              <p className="text-sm font-medium">
                Weekday: {weekdayAvg.toFixed(1)} · Weekend:{" "}
                {weekendAvg.toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Customer Segmentation Section ──────────────────────────────────────────

function SegmentationSection({
  segmentation,
}: {
  segmentation: MLSegmentationResult | null;
}) {
  if (!segmentation || segmentation.status !== "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Customer Segments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {segmentation?.reason ||
              "Not enough customer data for segmentation yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const segments = segmentation.segments || {};
  const totalCustomers = segmentation.n_customers || 0;

  const pieData = Object.entries(segments).map(([label, count]) => ({
    name: label,
    value: count,
    fill: SEGMENT_COLORS[label] || "var(--muted-foreground)",
  }));

  const pieConfig: ChartConfig = Object.fromEntries(
    pieData.map((d) => [d.name, { label: d.name, color: d.fill }])
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Customer Segments
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  This model is unavailable until its Stage 6 operational-input
                  training contract and evidence are complete.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          {/* Donut chart */}
          <div className="shrink-0">
            <ChartContainer
              config={pieConfig}
              className="h-[140px] w-[140px]"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={35}
                  outerRadius={60}
                  strokeWidth={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          {/* Segment list */}
          <div className="flex-1 space-y-2">
            <p className="text-xs text-muted-foreground mb-2">
              {totalCustomers} customers segmented
            </p>
            {Object.entries(segments).map(([label, count]) => (
              <div
                key={label}
                className="flex items-center justify-between p-2 rounded-md border bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        SEGMENT_COLORS[label] || "var(--muted-foreground)",
                    }}
                  />
                  <span className="text-sm font-medium capitalize">
                    {SEGMENT_ICONS[label] || ""} {label.replace(/_/g, " ")}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Cancellation Prediction Section ────────────────────────────────────────

function CancellationSection({
  cancellation,
  highRiskReservations,
  businessTimezone,
  locale,
}: {
  cancellation: MLCancellationResult | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  highRiskReservations: any[];
  businessTimezone: string;
  locale: string;
}) {
  if (!cancellation || cancellation.status !== "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Cancellation Prediction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {cancellation?.reason ||
              "Not enough resolved reservations to train the model yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const metrics = cancellation.metrics!;
  const featureImportance = cancellation.feature_importance || {};

  // Top 6 features for the chart
  const topFeatures = Object.entries(featureImportance)
    .slice(0, 6)
    .map(([name, importance]) => ({
      name: name
        .replace(/_/g, " ")
        .replace(/customer /g, "cust. ")
        .replace(/cancellation/g, "cancel"),
      importance: Math.round(importance),
    }));

  const featureChartConfig: ChartConfig = {
    importance: { label: "Importance", color: seriesVar(3) },
  };

  // Generate insight sentence from top feature
  const topFeature = Object.keys(featureImportance)[0];
  const insightText = getInsightText(topFeature);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Cancellation Prediction
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p className="text-xs">
                  LightGBM classifier trained on resolved reservations to predict
                  cancellation probability. Evaluated with stratified
                  cross-validation.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Metrics grid */}
          <div className="grid grid-cols-4 gap-2">
            <MetricBadge label="AUC-ROC" value={metrics.auc_roc} />
            <MetricBadge label="Precision" value={metrics.precision} />
            <MetricBadge label="Recall" value={metrics.recall} />
            <MetricBadge label="F1" value={metrics.f1} />
          </div>

          {/* Feature importance */}
          {topFeatures.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <BarChart3 className="h-3 w-3" />
                Top risk factors
              </p>
              <ChartContainer
                config={featureChartConfig}
                className="h-[140px] w-full"
              >
                <BarChart data={topFeatures} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                  />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={100}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="importance"
                    fill={seriesVar(3)}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          )}

          {/* Insight */}
          {insightText && (
            <p className="text-xs text-muted-foreground italic border-l-2 border-amber-400 pl-3">
              {insightText}
            </p>
          )}

          {/* High-risk upcoming reservations */}
          {highRiskReservations.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                High-risk upcoming reservations
              </p>
              <div className="space-y-1">
                {highRiskReservations.map((r) => {
                  const riskPct = Math.round(r.risk_score * 100);
                  // Neutral. A cancellation-risk score is a forecast about
                  // next week; §08 puts predictions on the neutral tier, and a
                  // red badge here would outrank a genuinely late ticket.
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-2 rounded-md border bg-muted/30 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {new Date(r.time).toLocaleString(locale, {
                          timeZone: businessTimezone,
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {r.guests} {r.guests === 1 ? "guest" : "guests"}
                      </span>
                      <Badge tone="neutral">
                        {riskPct}% risk
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Operational KPIs Section ───────────────────────────────────────────────

function OperationalKpisSection({
  kpis,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kpis: any;
}) {
  const hasOrdering = kpis.ordering !== null;
  const hasInventory = kpis.inventory !== null;

  const occupancyConfig: ChartConfig = {
    count: { label: "Reservations", color: seriesVar(1) },
  };
  const topItemsConfig: ChartConfig = {
    total_ordered: { label: "Ordered", color: seriesVar(2) },
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Operational KPIs
          <span className="text-xs font-normal text-muted-foreground">
            — last 30 days
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="reservations">
          <TabsList className="mb-4">
            <TabsTrigger value="reservations" className="text-xs">
              <CalendarClock className="h-3 w-3 mr-1" />
              Reservations
            </TabsTrigger>
            {hasOrdering && (
              <TabsTrigger value="ordering" className="text-xs">
                <ShoppingCart className="h-3 w-3 mr-1" />
                Ordering
              </TabsTrigger>
            )}
            {hasInventory && (
              <TabsTrigger value="inventory" className="text-xs">
                <Package className="h-3 w-3 mr-1" />
                Inventory
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="reservations" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <KpiStatCard
                label="Completion rate"
                value={`${Math.round(kpis.reservation.completion_rate * 100)}%`}
              />
              <KpiStatCard
                label="Cancellation rate"
                value={`${Math.round(kpis.reservation.cancellation_rate * 100)}%`}
              />
              <KpiStatCard
                label="Avg lead time"
                value={`${kpis.reservation.avg_lead_time_hours}h`}
              />
            </div>
            {kpis.reservation.occupancy_by_hour?.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  Reservations by hour of day
                </p>
                <ChartContainer config={occupancyConfig} className="h-[140px] w-full">
                  <BarChart data={kpis.reservation.occupancy_by_hour}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      tickFormatter={(h) => `${h}:00`}
                    />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar
                      dataKey="count"
                      fill={seriesVar(1)}
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>
              </div>
            )}
          </TabsContent>

          {hasOrdering && (
            <TabsContent value="ordering" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <KpiStatCard
                  label="Avg prep time"
                  value={`${kpis.ordering.avg_prep_time_minutes} min`}
                />
                <KpiStatCard
                  label="Peak hour"
                  value={
                    kpis.ordering.peak_hours?.[0]
                      ? `${kpis.ordering.peak_hours[0].hour}:00`
                      : "—"
                  }
                />
              </div>
              {kpis.ordering.top_items?.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Top items by quantity ordered
                  </p>
                  <ChartContainer config={topItemsConfig} className="h-[140px] w-full">
                    <BarChart data={kpis.ordering.top_items} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={110}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="total_ordered"
                        fill={seriesVar(2)}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              )}
            </TabsContent>
          )}

          {hasInventory && (
            <TabsContent value="inventory" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <KpiStatCard
                  label="Total movements"
                  value={String(kpis.inventory.total_movements)}
                />
                <KpiStatCard
                  label="Waste events"
                  value={String(kpis.inventory.waste_movements)}
                />
                <KpiStatCard
                  label="Low-stock alerts"
                  value={String(kpis.inventory.low_stock_incidents)}
                />
                <KpiStatCard
                  label="Items below par"
                  value={String(kpis.inventory.items_below_par)}
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function KpiStatCard({ label, value }: { label: string; value: string }) {
  // NO TONE PROP, deliberately. These tiles used to take
  // "green" | "yellow" | "red" and the call sites computed a traffic light:
  // green when a completion rate cleared 70%, red when cancellations passed
  // 15%, red on a low-stock incident, amber on items below par.
  //
  // Every one of those is a named §08 violation. Green may never mean "good
  // news about a number". Stock is never critical. Par levels never qualify as
  // attend. And a rate being higher than someone hoped is the exact case the
  // rank calls non-qualifying.
  //
  // The port had already blanked the colour map to empty strings, but left the
  // prop and the judgements in place — dead code that reads like a decision
  // waiting to be switched back on. Both are gone. These are operational
  // figures; weight and position carry them.
  return (
    <div className="border border-border p-3">
      <p className="type-label text-muted-foreground">{label}</p>
      <p className="type-t2 mt-0.5">{value}</p>
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────────────────────────

function MetricBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
        {value.toFixed(2)}
      </p>
    </div>
  );
}

function getInsightText(topFeature: string | undefined): string {
  if (!topFeature) return "";

  const insights: Record<string, string> = {
    lead_time_hours:
      "Reservations booked far in advance have the highest cancellation risk. Consider sending confirmation reminders.",
    lead_time_days:
      "Booking lead time is the strongest predictor. Earlier bookings are more likely to be cancelled.",
    customer_cancellation_rate:
      "A customer's past cancellation behavior is a strong predictor. Watch repeat cancellers.",
    is_weekend:
      "Weekend reservations show different cancellation patterns than weekdays.",
    guests:
      "Group size affects cancellation risk. Larger parties tend to have different patterns.",
    hour_of_day:
      "The time of day matters — certain time slots see more cancellations.",
    day_of_week:
      "Some days of the week see more cancellations than others.",
    guest_capacity_ratio:
      "How full the table/room is relative to capacity affects cancellation patterns.",
    has_note:
      "Customers who leave notes tend to have different cancellation behavior.",
    customer_total_reservations:
      "Experienced customers (more past bookings) show different patterns than first-timers.",
    customer_avg_guests:
      "A customer's typical party size correlates with their cancellation tendency.",
  };

  return insights[topFeature] || `"${topFeature.replace(/_/g, " ")}" is the strongest predictor of cancellations.`;
}
