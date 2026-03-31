"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Calendar, Clock, Users, MapPin, ArrowRight, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CustomerDashboardStats } from "@/lib/api-client";
import {
  clientGetBusiness,
  clientGetServiceType,
} from "@/lib/client-api";
import { Business, ServiceType } from "@/types";
import { cn } from "@/lib/utils";

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
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set());
  const [filterTab, setFilterTab] = useState<"day" | "week" | "month">("day");

  const toggleReservation = (id: string) => {
    setExpandedReservations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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

  // Calculate additional metrics
  const confirmedCount = stats.status_breakdown.confirmed;
  const pendingCount = stats.status_breakdown.pending;
  const cancelledCount = stats.status_breakdown.cancelled;
  const completedCount = stats.status_breakdown.completed;
  const successRate = stats.total_reservations > 0
    ? Math.round(((confirmedCount + completedCount) / stats.total_reservations) * 100)
    : 0;

  return (
    <div className="p-6 h-[calc(100vh-3rem)] flex flex-col gap-4 overflow-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          Welcome back, {customerName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here&apos;s your reservation overview
        </p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 flex-none">
        {/* Total Reservations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reservations</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_reservations}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        {/* Confirmed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{confirmedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Active bookings</p>
          </CardContent>
        </Card>

        {/* Pending */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting confirmation</p>
          </CardContent>
        </Card>

        {/* Completed */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{completedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Past reservations</p>
          </CardContent>
        </Card>

        {/* Cancelled */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{cancelledCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Cancelled bookings</p>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">Confirmed + Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie Chart - Status Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Reservation Status
              </CardTitle>
              {/* Filter Tabs */}
              <div className="flex gap-1 border rounded-md p-0.5">
                <button
                  onClick={() => setFilterTab("day")}
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded transition-colors",
                    filterTab === "day"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Day
                </button>
                <button
                  onClick={() => setFilterTab("week")}
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded transition-colors",
                    filterTab === "week"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Week
                </button>
                <button
                  onClick={() => setFilterTab("month")}
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded transition-colors",
                    filterTab === "month"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Month
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
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
        <Card className="lg:col-span-2">
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
          <CardContent className="max-h-[400px] overflow-auto">
            <div className="space-y-2">
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
                  const isExpanded = expandedReservations.has(reservation.id);
                  
                  return (
                    <Collapsible
                      key={reservation.id}
                      open={isExpanded}
                      onOpenChange={() => toggleReservation(reservation.id)}
                    >
                      <div className="border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3 flex-1">
                              <div className="flex flex-col text-left">
                                <h3 className="font-medium text-sm">
                                  {business?.name || "Loading..."}
                                </h3>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                  <MapPin className="h-3 w-3" />
                                  {business?.address || "Address not available"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${
                                  reservation.status === "confirmed"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                }`}
                              >
                                {reservation.status}
                              </span>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(reservation.time)}</span>
                                <Clock className="h-3 w-3 ml-1" />
                                <span>{formatTime(reservation.time)}</span>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-4 pb-4 pt-0 border-t bg-background/50 space-y-3">
                            <div className="grid grid-cols-2 gap-4 pt-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Service Details</p>
                                <p className="text-sm font-medium">{serviceType?.name || "Unknown"}</p>
                                {serviceType?.description && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {serviceType.description}
                                  </p>
                                )}
                                {serviceType?.duration && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Duration: {serviceType.duration} minutes
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Reservation Info</p>
                                <p className="text-sm">
                                  Guests: <span className="font-medium">{reservation.guests}</span>
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Status: <span className="capitalize">{reservation.status}</span>
                                </p>
                                {business?.phone && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Phone: {business.phone}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Link href={`/customer/reservations?highlight=${reservation.id}`}>
                                <Button variant="outline" size="sm" className="text-xs">
                                  View Details
                                </Button>
                              </Link>
                              {business && (
                                <Link href={`/business/${business.slug}`}>
                                  <Button variant="outline" size="sm" className="text-xs">
                                    View Business
                                  </Button>
                                </Link>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
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
