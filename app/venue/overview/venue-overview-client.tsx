"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Calendar, Clock, Users, Bell, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  getVenueDashboardStats,
  getVenueById,
  getTableById,
} from "@/mock-data";
import { Reservation } from "@/types";

interface VenueOverviewClientProps {
  venueId: string;
}

export default function VenueOverviewClient({
  venueId,
}: VenueOverviewClientProps) {
  const stats = useMemo(() => getVenueDashboardStats(venueId), [venueId]);
  const venue = useMemo(() => getVenueById(venueId), [venueId]);

  const statusChartData = useMemo(
    () => [
      { name: "Confirmed", value: stats.statusBreakdown.confirmed, fill: "#22c55e" },
      { name: "Pending", value: stats.statusBreakdown.pending, fill: "#eab308" },
      { name: "Cancelled", value: stats.statusBreakdown.cancelled, fill: "#ef4444" },
      { name: "Completed", value: stats.statusBreakdown.completed, fill: "#6b7280" },
    ],
    [stats.statusBreakdown]
  );

  const pieChartConfig: ChartConfig = {
    confirmed: { label: "Confirmed", color: "#22c55e" },
    pending: { label: "Pending", color: "#eab308" },
    cancelled: { label: "Cancelled", color: "#ef4444" },
    completed: { label: "Completed", color: "#6b7280" },
  };

  const columnChartConfig: ChartConfig = stats.reservationsByType.reduce(
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

  return (
    <div className="p-6 h-[calc(100vh-3rem)] flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{venue?.name}</p>
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
            <div className="text-2xl font-bold">{stats.todayReservations}</div>
            <p className="text-xs text-muted-foreground">
              {stats.monthChange >= 0 ? "+" : ""}
              {stats.monthChange}% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingRequests}</div>
            <Link href="/venue/requests">
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
            <div className="text-2xl font-bold">{stats.todayGuestCount}</div>
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
        {/* Stacked Column Chart */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reservations by Type (7 days)</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <ChartContainer config={columnChartConfig} className="h-full w-full">
              <BarChart data={stats.dailyByType}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {stats.reservationsByType.map((type) => (
                  <Bar
                    key={type.name}
                    dataKey={type.name.replace(/\s+/g, "")}
                    stackId="a"
                    fill={type.color}
                    radius={[0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Upcoming Reservations */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Reservations</CardTitle>
            <Link href="/venue/reservations">
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs">
                See all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-3">
              {stats.upcomingReservations.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No upcoming reservations
                </p>
              ) : (
                stats.upcomingReservations.map((reservation: Reservation) => {
                  const table = getTableById(reservation.tableId);
                  return (
                    <div
                      key={reservation.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            {reservation.email.split("@")[0]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {table?.number} · {reservation.guests} guests
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
    </div>
  );
}
