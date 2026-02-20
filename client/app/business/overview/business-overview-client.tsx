"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Calendar, Clock, Users, Bell, ArrowRight, BrainCircuit, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Business, ServiceType } from "@/types";
import { BusinessDashboardStats } from "@/lib/api-client";
import type { MLDemandForecastResult, MLSegmentationResult } from "@/lib/ml-api";

interface BusinessOverviewClientProps {
  business: Business;
  stats: BusinessDashboardStats;
  serviceTypes: ServiceType[];
  demandForecast?: MLDemandForecastResult | null;
  segmentation?: MLSegmentationResult | null;
}

export default function BusinessOverviewClient({
  business,
  stats,
  serviceTypes,
  demandForecast,
  segmentation,
}: BusinessOverviewClientProps) {
  const statusChartData = useMemo(
    () => [
      { name: "Confirmed", value: stats.status_breakdown.confirmed, fill: "#22c55e" },
      { name: "Pending", value: stats.status_breakdown.pending, fill: "#eab308" },
      { name: "Cancelled", value: stats.status_breakdown.cancelled, fill: "#ef4444" },
      { name: "Completed", value: stats.status_breakdown.completed, fill: "#6b7280" },
    ],
    [stats.status_breakdown]
  );

  const pieChartConfig: ChartConfig = {
    confirmed: { label: "Confirmed", color: "#22c55e" },
    pending: { label: "Pending", color: "#eab308" },
    cancelled: { label: "Cancelled", color: "#ef4444" },
    completed: { label: "Completed", color: "#6b7280" },
  };

  const columnChartConfig: ChartConfig = stats.reservations_by_type.reduce(
    (acc, type) => ({
      ...acc,
      [type.name.replace(/\s+/g, "")]: { label: type.name, color: type.color },
    }),
    {} as ChartConfig
  );

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Build daily by type data from service types for the chart
  // The analytics endpoint doesn't return dailyByType yet, so we show reservations_by_type
  const barChartData = stats.reservations_by_type.map((type) => ({
    name: type.name,
    count: type.count,
    fill: type.color,
  }));

  // Find service type name for upcoming reservations
  const getServiceTypeName = (serviceTypeId: string) => {
    return serviceTypes.find((st) => st.id === serviceTypeId)?.name || "Unknown";
  };

  return (
    <div className="p-6 h-[calc(100vh-3rem)] flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{business.name}</p>
      </div>

      {/* Row 1: Metric Cards + Pie Chart */}
      <div className="grid grid-cols-4 gap-3 flex-none">
        {/* Metric Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Reservations</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today_reservations}</div>
            <p className="text-xs text-muted-foreground">
              {stats.month_change >= 0 ? "+" : ""}
              {stats.month_change}% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending_requests}</div>
            <Link href="/business/requests">
              <Button variant="link" className="h-auto p-0 text-xs">
                View all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Guests Today</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.today_guest_count}</div>
            <p className="text-xs text-muted-foreground">Expected guests</p>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Status (7 days)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ChartContainer config={pieChartConfig} className="h-[100px] w-[100px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={25}
                  outerRadius={45}
                  strokeWidth={2}
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Column Chart + Upcoming Reservations */}
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {/* Column Chart */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reservations by Type (7 days)</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <ChartContainer config={columnChartConfig} className="h-full w-full">
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {barChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Upcoming Reservations */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Reservations</CardTitle>
            <Link href="/business/reservations">
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs">
                See all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-3">
              {stats.upcoming_reservations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No upcoming reservations
                </p>
              ) : (
                stats.upcoming_reservations.map((reservation) => {
                  const serviceTypeName = getServiceTypeName(reservation.service_type_id);
                  return (
                    <div
                      key={reservation.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {serviceTypeName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {reservation.guests} guests
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(reservation.time)}</span>
                        <span>{formatTime(reservation.time)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: ML Insights Teasers */}
      <ForecastTeaser demandForecast={demandForecast} segmentation={segmentation} />
    </div>
  );
}

// ─── ML Forecast Teaser ─────────────────────────────────────────────────────

function ForecastTeaser({
  demandForecast,
  segmentation,
}: {
  demandForecast?: MLDemandForecastResult | null;
  segmentation?: MLSegmentationResult | null;
}) {
  const hasForecast = demandForecast?.status === "success" && demandForecast.forecasts;
  const hasSegments = segmentation?.status === "success" && segmentation.segments;

  // If no ML data at all, show a single CTA card
  if (!hasForecast && !hasSegments) {
    return (
      <Card className="flex-none">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">ML Insights</p>
              <p className="text-xs text-muted-foreground">
                Get demand forecasts, customer segments, and cancellation predictions
              </p>
            </div>
          </div>
          <Link href="/business/insights">
            <Button variant="outline" size="sm">
              Set up <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Build forecast summary
  const forecasts = demandForecast?.forecasts || {};
  const allForecasts = Object.values(forecasts).flat();
  const totalPredicted = allForecasts.reduce((s, f) => s + f.predicted_reservations, 0);
  const busiestDay = allForecasts.length > 0
    ? allForecasts.reduce((max, f) => f.predicted_reservations > max.predicted_reservations ? f : max)
    : null;
  const busiestDayName = busiestDay
    ? new Date(busiestDay.date).toLocaleDateString("en-US", { weekday: "short" })
    : null;

  // Build segment summary
  const segments = segmentation?.segments || {};
  const segmentEntries = Object.entries(segments);
  const topSegment = segmentEntries.length > 0
    ? segmentEntries.reduce((max, entry) => entry[1] > max[1] ? entry : max)
    : null;

  return (
    <div className="grid grid-cols-2 gap-3 flex-none">
      {/* Forecast teaser */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">7-Day Forecast</p>
              {hasForecast ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{Math.round(totalPredicted)}</span> predicted reservations
                  {busiestDayName && (
                    <> · busiest on <span className="font-medium text-foreground">{busiestDayName}</span></>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Run the pipeline to see predictions
                </p>
              )}
            </div>
          </div>
          <Link href="/business/insights">
            <Button variant="ghost" size="sm" className="text-xs">
              Details <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Segment teaser */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Customer Segments</p>
              {hasSegments ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{segmentation!.n_customers}</span> customers segmented
                  {topSegment && (
                    <> · largest: <span className="font-medium text-foreground capitalize">{topSegment[0].replace(/_/g, " ")}</span> ({topSegment[1]})</>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Run the pipeline to see segments
                </p>
              )}
            </div>
          </div>
          <Link href="/business/insights">
            <Button variant="ghost" size="sm" className="text-xs">
              Details <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
