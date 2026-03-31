"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Users,
  Bell,
  ArrowRight,
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  UserCircle,
  ChevronDown,
  ChevronUp,
  CalendarOff,
  MessageCircle,
  Share2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Business, ServiceType } from "@/types";
import { BusinessDashboardStats } from "@/lib/api-client";
import type {
  MLDemandForecastResult,
  MLSegmentationResult,
} from "@/lib/ml-api";
import { cn } from "@/lib/utils";
import { BusinessDocsChatTrigger } from "@/components/business-docs-chat-trigger";

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
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set());
  const [selectedServiceType, setSelectedServiceType] = useState<string>("all");
  const [chatOpen, setChatOpen] = useState(false);

  const toggleReservation = (id: string) => {
    setExpandedReservations((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const statusChartData = useMemo(
    () => [
      { name: "Confirmed",  value: stats.status_breakdown.confirmed,  fill: "#22c55e" },
      { name: "Pending",    value: stats.status_breakdown.pending,    fill: "#eab308" },
      { name: "Cancelled",  value: stats.status_breakdown.cancelled,  fill: "#ef4444" },
      { name: "Completed",  value: stats.status_breakdown.completed,  fill: "#6b7280" },
    ],
    [stats.status_breakdown],
  );

  const pieChartConfig: ChartConfig = {
    confirmed: { label: "Confirmed", color: "#22c55e" },
    pending:   { label: "Pending",   color: "#eab308" },
    cancelled: { label: "Cancelled", color: "#ef4444" },
    completed: { label: "Completed", color: "#6b7280" },
  };

  const formatTime = (isoString: string) =>
    new Date(isoString).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true,
    });

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const weeklyChartData = useMemo(() => {
    if (!stats.daily_by_type || stats.daily_by_type.length === 0) {
      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return dayNames.map((day) => {
        const d: Record<string, string | number> = { day };
        serviceTypes.forEach((st) => { d[st.name] = 0; });
        return d;
      });
    }
    if (selectedServiceType === "all") return stats.daily_by_type;
    const selected = serviceTypes.find((st) => st.id === selectedServiceType);
    if (!selected) return stats.daily_by_type;
    return stats.daily_by_type.map((d) => ({ day: d.day, [selected.name]: d[selected.name] || 0 }));
  }, [stats.daily_by_type, selectedServiceType, serviceTypes]);

  const weeklyChartConfig: ChartConfig = serviceTypes.reduce(
    (acc, type) => ({ ...acc, [type.name.replace(/\s+/g, "")]: { label: type.name, color: type.color } }),
    {} as ChartConfig,
  );

  const getServiceTypeName = (id: string) =>
    serviceTypes.find((st) => st.id === id)?.name || "Unknown";

  const totalReservations =
    stats.status_breakdown.confirmed +
    stats.status_breakdown.pending +
    stats.status_breakdown.completed;

  const avgGuestsPerReservation =
    totalReservations > 0
      ? Math.round((stats.today_guest_count / Math.max(stats.today_reservations, 1)) * 10) / 10
      : 0;

  const cancellationRate =
    totalReservations > 0
      ? Math.round(
          (stats.status_breakdown.cancelled / (totalReservations + stats.status_breakdown.cancelled)) * 100,
        )
      : 0;

  const hasPieData = totalReservations > 0 || stats.status_breakdown.cancelled > 0;

  // ─── KPI card definitions ──────────────────────────────────────────────────
  const kpiCards = [
    {
      label: "Today's Reservations",
      value: stats.today_reservations,
      icon: Calendar,
      trend: stats.month_change !== 0 ? stats.month_change : null,
      trendLabel: "vs last month",
      action: null,
    },
    {
      label: "Pending Requests",
      value: stats.pending_requests,
      icon: Bell,
      trend: null,
      trendLabel: null,
      action: { href: "/business/requests", label: "View all" },
    },
    {
      label: "Guests Today",
      value: stats.today_guest_count,
      icon: Users,
      trend: null,
      trendLabel: null,
      action: null,
    },
    {
      label: "Total This Week",
      value: totalReservations,
      icon: Calendar,
      trend: null,
      trendLabel: null,
      action: null,
    },
    {
      label: "Avg Guests",
      value: avgGuestsPerReservation,
      icon: UserCircle,
      trend: null,
      trendLabel: "per reservation",
      action: null,
    },
    {
      label: "Cancellation Rate",
      value: `${cancellationRate}%`,
      icon: CalendarOff,
      trend: null,
      trendLabel: "last 7 days",
      action: null,
    },
  ];

  return (
    <div className="p-4 h-[calc(100vh-3rem)] flex flex-col gap-3 overflow-auto">

      {/* ── KPI Grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 flex-none">
        {kpiCards.map((card) => (
          <Card key={card.label} className="border-border/60">
            <CardContent className="p-3">
              <div className="flex items-start justify-between mb-1">
                <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
                <card.icon className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
              </div>
              <p className="text-xl font-semibold tracking-tight">{card.value}</p>
              {card.trend !== null && (
                <div className="flex items-center gap-1 mt-1">
                  {card.trend >= 0
                    ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                    : <TrendingDown className="h-3 w-3 text-red-500" />}
                  <span className={cn("text-xs font-medium", card.trend >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {card.trend >= 0 ? "+" : ""}{card.trend}%
                  </span>
                  {card.trendLabel && (
                    <span className="text-xs text-muted-foreground">{card.trendLabel}</span>
                  )}
                </div>
              )}
              {!card.trend && card.trendLabel && (
                <p className="text-xs text-muted-foreground mt-1">{card.trendLabel}</p>
              )}
              {card.action && (
                <Link href={card.action.href}>
                  <Button variant="link" className="h-auto p-0 text-xs mt-1">
                    {card.action.label} <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Main Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr_minmax(220px,3fr)] gap-3 flex-1 min-h-0">

        {/* Column 1: Weekly Bar Chart */}
        <Card className="flex flex-col h-full">
          <CardHeader className="pb-2 pt-3 px-3 flex-none">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xs font-medium">Reservations</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">This week by type</p>
              </div>
              <Select value={selectedServiceType} onValueChange={setSelectedServiceType}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {serviceTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 pb-3 px-3">
            <ChartContainer config={weeklyChartConfig} className="h-full w-full">
              <BarChart data={weeklyChartData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "var(--muted-foreground)" }} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "var(--muted-foreground)" }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                {selectedServiceType === "all"
                  ? serviceTypes.map((type, index) => {
                      const isFirst = index === 0;
                      const isLast = index === serviceTypes.length - 1;
                      return (
                        <Bar
                          key={type.id}
                          dataKey={type.name}
                          stackId="a"
                          fill={type.color}
                          radius={isFirst ? [0, 0, 4, 4] : isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        />
                      );
                    })
                  : (() => {
                      const t = serviceTypes.find((st) => st.id === selectedServiceType);
                      return t ? <Bar dataKey={t.name} fill={t.color} radius={[4, 4, 0, 0]} /> : null;
                    })()}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Column 2: Upcoming Reservations */}
        <Card className="flex flex-col h-full">
          <CardHeader className="flex flex-row items-start justify-between pb-2 pt-3 px-3 flex-none">
            <div>
              <CardTitle className="text-xs font-medium">Upcoming</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Next reservations</p>
            </div>
            <Link href="/business/reservations">
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
                See all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto min-h-0 pb-3 px-3">
            {stats.upcoming_reservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Clock className="h-5 w-5 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">All clear</p>
                <p className="text-xs text-muted-foreground/70 mt-1">No upcoming reservations</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.upcoming_reservations.map((reservation) => {
                  const serviceTypeName = getServiceTypeName(reservation.service_type_id);
                  const serviceType = serviceTypes.find((st) => st.id === reservation.service_type_id);
                  const isExpanded = expandedReservations.has(reservation.id);

                  return (
                    <Collapsible
                      key={reservation.id}
                      open={isExpanded}
                      onOpenChange={() => toggleReservation(reservation.id)}
                    >
                      <div className="border border-border/60 rounded-lg hover:bg-muted/30 transition-colors">
                        <CollapsibleTrigger className="w-full text-left">
                          <div className="flex items-center justify-between p-3">
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-sm font-medium truncate">{serviceTypeName}</span>
                              <span className="text-xs text-muted-foreground">
                                {reservation.guests} {reservation.guests === 1 ? "guest" : "guests"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 ml-2 shrink-0">
                              <div className="text-right">
                                <p className="text-xs font-medium">{formatDate(reservation.time)}</p>
                                <p className="text-xs text-muted-foreground">{formatTime(reservation.time)}</p>
                              </div>
                              {isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-3 pb-3 border-t border-border/60 space-y-3 pt-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Service</p>
                                <p className="text-xs">{serviceType?.description || "—"}</p>
                                {serviceType?.duration && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{serviceType.duration} min</p>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                                <p className="text-xs capitalize">{reservation.status}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">#{reservation.id.slice(0, 8)}</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Link href={`/business/reservations?highlight=${reservation.id}`}>
                                <Button variant="outline" size="sm" className="text-xs h-7">Details</Button>
                              </Link>
                              <Link href={`/business/customers?highlight=${reservation.customer_id}`}>
                                <Button variant="outline" size="sm" className="text-xs h-7">Customer</Button>
                              </Link>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Column 3: Status Breakdown + Insights Carousel */}
        <div className="flex flex-col gap-3 h-full">

          {/* Status Breakdown */}
          <Card className="flex-none">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs font-medium">Status Breakdown</CardTitle>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {hasPieData ? (
                <>
                  <div className="flex justify-center">
                    <ChartContainer config={pieChartConfig} className="h-[90px] w-[90px]">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                        <Pie
                          data={statusChartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={22}
                          outerRadius={43}
                          strokeWidth={2}
                        >
                          {statusChartData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
                    {statusChartData.map((s) => (
                      <div key={s.name} className="flex items-center gap-1.5 min-w-0">
                        <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.fill }} />
                        <span className="text-xs text-muted-foreground truncate">{s.name}</span>
                        <span className="text-xs font-medium ml-auto">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                    <Calendar className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">No data yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5 max-w-[150px]">
                    Stats appear once bookings come in
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Insights Carousel */}
          <InsightsCarousel
            demandForecast={demandForecast}
            segmentation={segmentation}
            businessSlug={business.slug}
            onOpenChat={() => setChatOpen(true)}
          />
        </div>
      </div>

      {/* Hidden chat sheet — controlled by carousel */}
      <BusinessDocsChatTrigger open={chatOpen} onOpenChange={setChatOpen} hideTrigger />
    </div>
  );
}

// ─── Insights Carousel ────────────────────────────────────────────────────────

function InsightsCarousel({
  demandForecast,
  segmentation,
  businessSlug,
  onOpenChat,
}: {
  demandForecast?: MLDemandForecastResult | null;
  segmentation?: MLSegmentationResult | null;
  businessSlug: string;
  onOpenChat: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const TOTAL = 3;

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % TOTAL), 5000);
    return () => clearInterval(t);
  }, [paused]);

  const hasForecast = demandForecast?.status === "success" && demandForecast.forecasts;
  const hasSegments = segmentation?.status === "success" && segmentation.segments;
  const allForecasts = Object.values(demandForecast?.forecasts ?? {}).flat();
  const totalPredicted = allForecasts.reduce((s, f) => s + f.predicted_reservations, 0);

  const mlDescription =
    hasForecast || hasSegments
      ? [
          hasForecast && `${Math.round(totalPredicted)} predicted this week`,
          hasSegments && `${segmentation!.n_customers} customers segmented`,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Run the pipeline to unlock demand forecasts and customer segments";

  const slides = [
    {
      icon: BrainCircuit,
      iconBg: "bg-blue-50 dark:bg-blue-900/20",
      iconColor: "text-blue-600 dark:text-blue-400",
      title: "ML Insights",
      description: mlDescription,
      action: (
        <Link href="/business/insights">
          <Button variant="outline" size="sm" className="text-xs">
            View Insights <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      ),
    },
    {
      icon: MessageCircle,
      iconBg: "bg-emerald-50 dark:bg-emerald-900/20",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      title: "Any Questions?",
      description:
        "Ask the docs assistant how to use the dashboard, accept requests, or anything else",
      action: (
        <Button variant="outline" size="sm" className="text-xs" onClick={onOpenChat}>
          Ask Now <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      ),
    },
    {
      icon: Share2,
      iconBg: "bg-purple-50 dark:bg-purple-900/20",
      iconColor: "text-purple-600 dark:text-purple-400",
      title: "Share Your Booking Page",
      description: "Let customers book directly with your unique booking link",
      action: (
        <Link href={`/reserve/${businessSlug}`} target="_blank">
          <Button variant="outline" size="sm" className="text-xs">
            View Page <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      ),
    },
  ] as const;

  const current = slides[slide];
  const Icon = current.icon;

  return (
    <Card
      className="flex-1"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <CardContent className="flex flex-col items-center justify-center h-full py-6 text-center px-4">
        <div
          className={cn(
            "h-12 w-12 rounded-full flex items-center justify-center mb-3",
            current.iconBg,
          )}
        >
          <Icon className={cn("h-5 w-5", current.iconColor)} />
        </div>
        <p className="text-sm font-medium">{current.title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[180px]">
          {current.description}
        </p>
        <div className="mt-4">{current.action}</div>
        <div className="flex items-center gap-1.5 mt-4">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === slide
                  ? "w-4 bg-foreground/60"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50",
              )}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
