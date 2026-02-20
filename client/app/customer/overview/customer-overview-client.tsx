"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Calendar, Clock, Users, MapPin, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";
import { CustomerDashboardStats } from "@/lib/api-client";
import {
  clientGetBusiness,
  clientGetServiceType,
} from "@/lib/client-api";
import { Business, ServiceType } from "@/types";

interface CustomerOverviewClientProps {
  customerId: string;
  customerName: string;
  initialStats: CustomerDashboardStats | null;
}

export default function CustomerOverviewClient({
  customerId,
  customerName,
  initialStats,
}: CustomerOverviewClientProps) {
  const [businessCache, setBusinessCache] = useState<Map<string, Business>>(
    new Map()
  );
  const [serviceTypeCache, setServiceTypeCache] = useState<
    Map<string, ServiceType>
  >(new Map());

  const stats = initialStats || {
    total_reservations: 0,
    status_breakdown: { confirmed: 0, pending: 0, cancelled: 0, completed: 0 },
    upcoming_reservations: [],
  };

  // Fetch business and service type details for upcoming reservations
  useEffect(() => {
    if (!stats.upcoming_reservations.length) return;

    const businessIds = [
      ...new Set(stats.upcoming_reservations.map((r) => r.business_id)),
    ];
    const serviceTypeIds = [
      ...new Set(stats.upcoming_reservations.map((r) => r.service_type_id)),
    ];

    businessIds.forEach((id) => {
      clientGetBusiness(id).then((b) => {
        if (b) {
          setBusinessCache((prev) => new Map(prev).set(id, b));
        }
      });
    });

    serviceTypeIds.forEach((id) => {
      clientGetServiceType(id).then((st) => {
        if (st) {
          setServiceTypeCache((prev) => new Map(prev).set(id, st));
        }
      });
    });
  }, [stats.upcoming_reservations]);

  const statusChartData = useMemo(
    () => [
      {
        name: "confirmed",
        value: stats.status_breakdown.confirmed,
        fill: "#22c55e",
      },
      {
        name: "pending",
        value: stats.status_breakdown.pending,
        fill: "#eab308",
      },
      {
        name: "cancelled",
        value: stats.status_breakdown.cancelled,
        fill: "#ef4444",
      },
      {
        name: "completed",
        value: stats.status_breakdown.completed,
        fill: "#6b7280",
      },
    ],
    [stats.status_breakdown]
  );

  const pieChartConfig: ChartConfig = {
    confirmed: { label: "Confirmed", color: "#22c55e" },
    pending: { label: "Pending", color: "#eab308" },
    cancelled: { label: "Cancelled", color: "#ef4444" },
    completed: { label: "Completed", color: "#6b7280" },
  };

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
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="p-6 h-[calc(100vh-3rem)] flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {customerName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s your reservation overview
        </p>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Pie Chart - Status Breakdown */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Reservation Status
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center">
            <ChartContainer
              config={pieChartConfig}
              className="h-[180px] w-[180px]"
            >
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={statusChartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={75}
                  strokeWidth={2}
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartLegend
                  content={<ChartLegendContent nameKey="name" />}
                />
              </PieChart>
            </ChartContainer>
            <p className="text-center text-sm text-muted-foreground mt-2">
              {stats.total_reservations} total reservations
            </p>
          </CardContent>
        </Card>

        {/* Upcoming Reservations */}
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Upcoming Reservations
            </CardTitle>
            <Link href="/customer/reservations">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs"
              >
                See all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-4">
              {stats.upcoming_reservations.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No upcoming reservations
                  </p>
                  <Link href="/">
                    <Button variant="outline" size="sm" className="mt-3">
                      Browse businesses
                    </Button>
                  </Link>
                </div>
              ) : (
                stats.upcoming_reservations.map((reservation) => {
                  const business = businessCache.get(reservation.business_id);
                  const serviceType = serviceTypeCache.get(
                    reservation.service_type_id
                  );
                  return (
                    <div
                      key={reservation.id}
                      className="p-4 rounded-lg border bg-muted/30 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-medium">
                            {business?.name || "Loading..."}
                          </h3>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {business?.address || "Address not available"}
                          </p>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            reservation.status === "confirmed"
                              ? "bg-green-100 text-green-700"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {reservation.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(reservation.time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatTime(reservation.time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {reservation.guests} guests
                        </span>
                      </div>
                      {serviceType && (
                        <p className="text-xs text-muted-foreground">
                          {serviceType.name}
                        </p>
                      )}
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
