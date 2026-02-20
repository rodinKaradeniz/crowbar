"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BrainCircuit,
  RefreshCw,
  TrendingUp,
  Users,
  AlertTriangle,
  BarChart3,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
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
}

const SEGMENT_COLORS: Record<string, string> = {
  champions: "#22c55e",
  loyal: "#3b82f6",
  at_risk: "#eab308",
  new: "#8b5cf6",
  lost: "#ef4444",
};

const SEGMENT_ICONS: Record<string, string> = {
  champions: "⭐",
  loyal: "💚",
  at_risk: "⚠️",
  new: "🆕",
  lost: "💤",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function InsightsClient({
  status,
  segmentation,
  cancellation,
  demandForecast,
}: InsightsClientProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);

  const hasData = status?.status === "ok";
  const lastRun = status?.latest_run;

  const handleRunPipeline = async () => {
    setIsRunning(true);
    try {
      const mlBase =
        process.env.NEXT_PUBLIC_ML_SERVICE_URL || "http://localhost:8001";
      await fetch(`${mlBase}/pipeline/run?store_results=true`, {
        method: "POST",
      });
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
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BrainCircuit className="h-6 w-6" />
            Insights
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ML-powered analytics and predictions for your business
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRun && (
            <span className="text-xs text-muted-foreground">
              Last updated: {formatTimestamp(lastRun.timestamp)}
            </span>
          )}
          <Button
            onClick={handleRunPipeline}
            disabled={isRunning}
            size="sm"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRunning ? "animate-spin" : ""}`}
            />
            {isRunning ? "Running..." : "Run Pipeline"}
          </Button>
        </div>
      </div>

      {/* No data state */}
      {!hasData && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BrainCircuit className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No insights yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
              Run the ML pipeline to generate customer segmentation, cancellation
              predictions, and demand forecasts from your reservation data.
            </p>
            <Button onClick={handleRunPipeline} disabled={isRunning}>
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRunning ? "animate-spin" : ""}`}
              />
              {isRunning ? "Running Pipeline..." : "Run Pipeline"}
            </Button>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <>
          {/* Section 1: Demand Forecast */}
          <DemandForecastSection demandForecast={demandForecast} />

          {/* Section 2: Customer Segmentation + Cancellation side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SegmentationSection segmentation={segmentation} />
            <CancellationSection cancellation={cancellation} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Demand Forecast Section ────────────────────────────────────────────────

function DemandForecastSection({
  demandForecast,
}: {
  demandForecast: MLDemandForecastResult | null;
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
      day: new Date(f.date).toLocaleDateString("en-US", { weekday: "short" }),
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
    fill: d.is_weekend ? "#8b5cf6" : "#3b82f6",
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
    reservations: { label: "Predicted Reservations", color: "#3b82f6" },
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
                <div className="w-2.5 h-2.5 rounded-sm bg-[#3b82f6]" />
                Weekday
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#8b5cf6]" />
                Weekend
              </span>
            </div>
          </div>

          {/* Quick stats */}
          <div className="space-y-3">
            <div className="p-3 rounded-lg border bg-muted/30">
              <p className="text-xs text-muted-foreground">Total Expected</p>
              <p className="text-xl font-bold">
                {Math.round(totalPredicted)}
              </p>
              <p className="text-xs text-muted-foreground">reservations</p>
            </div>
            {busiestDay && (
              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground">Busiest Day</p>
                <p className="text-sm font-medium">
                  {busiestDay.day} ({Math.round(busiestDay.reservations)})
                </p>
              </div>
            )}
            {quietestDay && (
              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="text-xs text-muted-foreground">Quietest Day</p>
                <p className="text-sm font-medium">
                  {quietestDay.day} ({Math.round(quietestDay.reservations)})
                </p>
              </div>
            )}
            <div className="p-3 rounded-lg border bg-muted/30">
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
    fill: SEGMENT_COLORS[label] || "#6b7280",
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
                  Customers grouped by RFM analysis (Recency, Frequency,
                  Monetary value) using K-Means clustering.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          {/* Donut chart */}
          <div className="flex-shrink-0">
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
                      backgroundColor: SEGMENT_COLORS[label] || "#6b7280",
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
}: {
  cancellation: MLCancellationResult | null;
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
    importance: { label: "Importance", color: "#f59e0b" },
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
                    fill="#f59e0b"
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
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Helper Components ──────────────────────────────────────────────────────

function MetricBadge({ label, value }: { label: string; value: number }) {
  const color =
    value >= 0.7
      ? "text-green-600 dark:text-green-400"
      : value >= 0.5
        ? "text-yellow-600 dark:text-yellow-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="text-center p-2 rounded-md border bg-muted/30">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value.toFixed(2)}</p>
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
    has_payment:
      "Whether a reservation requires payment significantly affects cancellation likelihood.",
    is_paid:
      "Paid reservations are much less likely to be cancelled. Consider requiring deposits.",
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
