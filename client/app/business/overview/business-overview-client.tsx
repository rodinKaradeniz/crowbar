"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Clock,
  MessageCircle,
  Receipt,
  Share2,
  TrendingDown,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
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
import type { MLDemandForecastResult } from "@/lib/ml-api";
import { cn } from "@/lib/utils";
import { BusinessDocsChatTrigger } from "@/components/business-docs-chat-trigger";
import { formatMoney } from "@/lib/money";

interface BusinessOverviewClientProps {
  business: Business;
  stats: BusinessDashboardStats;
  serviceTypes: ServiceType[];
  demandForecast?: MLDemandForecastResult | null;
  docsAssistantEnabled: boolean;
}

export default function BusinessOverviewClient({
  business,
  stats,
  serviceTypes,
  demandForecast,
  docsAssistantEnabled,
}: BusinessOverviewClientProps) {
  const [expandedReservations, setExpandedReservations] = useState<Set<string>>(new Set());
  const [selectedServiceType, setSelectedServiceType] = useState<string>("all");
  const [chatOpen, setChatOpen] = useState(false);

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

  // Theme-aware status hues (resolve via CSS vars so dark mode recolors).
  const statusChartData = useMemo(
    () => [
      { name: "Confirmed", value: stats.status_breakdown.confirmed, fill: "var(--chart-1)" },
      { name: "Pending", value: stats.status_breakdown.pending, fill: "var(--chart-2)" },
      { name: "Cancelled", value: stats.status_breakdown.cancelled, fill: "var(--chart-3)" },
      { name: "Completed", value: stats.status_breakdown.completed, fill: "var(--chart-4)" },
    ],
    [stats.status_breakdown],
  );

  const pieChartConfig: ChartConfig = {
    confirmed: { label: "Confirmed", color: "var(--chart-1)" },
    pending: { label: "Pending", color: "var(--chart-2)" },
    cancelled: { label: "Cancelled", color: "var(--chart-3)" },
    completed: { label: "Completed", color: "var(--chart-4)" },
  };

  const formatTime = (isoString: string) =>
    new Date(isoString).toLocaleTimeString(business.locale, {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: stats.business_timezone,
    });

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const dateKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: stats.business_timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    const serviceDate = new Date(`${stats.service_date}T12:00:00Z`);
    const tomorrowKey = new Date(serviceDate.getTime() + 86_400_000)
      .toISOString().slice(0, 10);
    if (dateKey === stats.service_date) return "Today";
    if (dateKey === tomorrowKey) return "Tomorrow";
    return date.toLocaleDateString(business.locale, {
      month: "short", day: "numeric", timeZone: stats.business_timezone,
    });
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

  const cancellationRate =
    totalReservations > 0
      ? Math.round(
          (stats.status_breakdown.cancelled / (totalReservations + stats.status_breakdown.cancelled)) * 100,
        )
      : 0;

  const hasPieData = totalReservations > 0 || stats.status_breakdown.cancelled > 0;

  const ops = stats.ops ?? {};

  const todayLabel = new Date(`${stats.service_date}T12:00:00Z`).toLocaleDateString(business.locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // Forecast (was carousel slide 0 — now a standing tile)
  const hasForecast = demandForecast?.status === "success" && demandForecast.forecasts;
  const allDays = hasForecast ? Object.values(demandForecast!.forecasts!).flat() : [];
  const next3 = allDays.slice(0, 3);
  const busiest = hasForecast
    ? allDays.reduce(
        (max, d) => (d.predicted_reservations > max.predicted_reservations ? d : max),
        allDays[0],
      )
    : null;

  // ─── Header chips (small counts; the big figures live on the right) ────────
  const chips: Array<{
    label: string;
    value: number;
    emphasis?: boolean;
    href?: string;
  }> = [
    { label: "reservations today", value: stats.today_reservations, emphasis: true },
    { label: "pending requests", value: stats.pending_requests, href: "/business/requests" },
    ...(ops.open_tabs !== undefined ? [{ label: "open tabs", value: ops.open_tabs, href: "/business/tabs" }] : []),
    ...(ops.queue_waiting !== undefined ? [{ label: "waiting in queue", value: ops.queue_waiting, href: "/business/queue" }] : []),
    ...(ops.items_below_par !== undefined ? [{ label: "items below par", value: ops.items_below_par, href: "/business/inventory" }] : []),
  ];

  const bigStats: Array<{ label: string; value: string; icon: typeof Users }> = [
    { label: "Guests today", value: String(stats.today_guest_count), icon: Users },
    ...(ops.orders_today !== undefined
      ? [{ label: "Orders today", value: String(ops.orders_today), icon: Receipt }]
      : []),
    ...(ops.ordered_value_today !== undefined
      ? [{ label: "Ordered value today", value: formatMoney(ops.ordered_value_today, business.currencyCode, business.locale), icon: Banknote }]
      : []),
  ];

  return (
    <div className="page-pad space-y-8">

      {/* ── Greeting + stat band ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between fade-rise">
        <div className="min-w-0">
          <p className="eyebrow text-brass-deep dark:text-brass">{todayLabel}</p>
          <h1 className="font-display text-3xl md:text-4xl mt-1.5 tracking-tight">
            Welcome in, {business.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mt-6">
            {chips.map((chip) => {
              const inner = (
                <>
                  <span className="figures text-sm font-semibold">{chip.value}</span>
                  <span className="text-xs">{chip.label}</span>
                </>
              );
              const cls = cn(
                "inline-flex items-baseline gap-1.5 rounded-full px-3.5 py-1.5 transition-colors",
                chip.emphasis
                  ? "bg-lager text-porter"
                  : "bg-secondary text-secondary-foreground",
                chip.href && "hover:bg-accent",
              );
              return chip.href ? (
                <Link key={chip.label} href={chip.href} className={cls}>
                  {inner}
                </Link>
              ) : (
                <span key={chip.label} className={cls}>
                  {inner}
                </span>
              );
            })}
            {stats.month_change !== 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground">
                {stats.month_change >= 0
                  ? <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                <span className={cn("figures font-medium", stats.month_change >= 0 ? "text-primary" : "text-destructive")}>
                  {stats.month_change >= 0 ? "+" : ""}{stats.month_change}%
                </span>
                vs last month
              </span>
            )}
          </div>
        </div>

        {/* Big figures — the numbers carry the band */}
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4 shrink-0">
          {bigStats.map((s) => (
            <div key={s.label} className="min-w-0">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <s.icon className="h-3.5 w-3.5" />
                <span className="eyebrow">{s.label}</span>
              </div>
              <p className="figures text-4xl md:text-5xl tracking-tight mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Mosaic ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 fade-rise" style={{ animationDelay: "90ms" }}>

        {/* Weekly chart — wide */}
        <Card className="lg:col-span-2 border-border/40 shadow-none">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="eyebrow">Reservations this week</CardTitle>
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
          </CardHeader>
          <CardContent className="h-64">
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
                          isAnimationActive={false}
                          fill={type.color}
                          radius={isFirst ? [0, 0, 4, 4] : isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        />
                      );
                    })
                  : (() => {
                      const t = serviceTypes.find((st) => st.id === selectedServiceType);
                      return t ? <Bar dataKey={t.name} fill={t.color} radius={[4, 4, 0, 0]} isAnimationActive={false} /> : null;
                    })()}
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Upcoming — tall right rail */}
        <Card className="lg:row-span-2 border-border/40 shadow-none flex flex-col">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <CardTitle className="eyebrow">Upcoming</CardTitle>
            <Link href="/business/reservations">
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground">
                See all <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto max-h-136">
            {stats.upcoming_reservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Clock className="h-5 w-5 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">All clear</p>
                <p className="text-xs text-muted-foreground/70 mt-1">No upcoming reservations</p>
              </div>
            ) : (
              <div className="space-y-1">
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
                      <div className="rounded-lg hover:bg-muted/40 transition-colors">
                        <CollapsibleTrigger className="w-full text-left">
                          <div className="flex items-center justify-between px-2.5 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span className="figures text-sm shrink-0 w-16 text-muted-foreground">
                                {formatTime(reservation.time)}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium truncate">{serviceTypeName}</span>
                                <span className="figures text-xs text-muted-foreground">
                                  {formatDate(reservation.time)} · {reservation.guests}{" "}
                                  {reservation.guests === 1 ? "guest" : "guests"}
                                </span>
                              </div>
                            </div>
                            {isExpanded
                              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-2.5 pb-3 space-y-3 pt-1">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="eyebrow mb-1">Service</p>
                                <p className="text-xs">{serviceType?.description || "—"}</p>
                                {serviceType?.duration && (
                                  <p className="figures text-xs text-muted-foreground mt-0.5">{serviceType.duration} min</p>
                                )}
                              </div>
                              <div>
                                <p className="eyebrow mb-1">Status</p>
                                <p className="text-xs capitalize">{reservation.status}</p>
                                <p className="figures text-xs text-muted-foreground mt-0.5">#{reservation.id.slice(0, 8)}</p>
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

        {/* Status breakdown — donut + rate figure */}
        <Card className="border-border/40 shadow-none">
          <CardHeader className="pb-1">
            <CardTitle className="eyebrow">Last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            {hasPieData ? (
              <div className="flex items-center gap-5">
                <ChartContainer config={pieChartConfig} className="h-[110px] w-[110px] shrink-0">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Pie
                      data={statusChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={30}
                      outerRadius={52}
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {statusChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="flex-1 min-w-0 space-y-1.5">
                  {statusChartData.map((s) => (
                    <div key={s.name} className="flex items-center gap-1.5 min-w-0">
                      <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: s.fill }} />
                      <span className="text-xs text-muted-foreground truncate">{s.name}</span>
                      <span className="figures text-xs font-medium ml-auto">{s.value}</span>
                    </div>
                  ))}
                  <div className="flex items-baseline gap-1.5 pt-1.5">
                    <span className="figures text-xl">{cancellationRate}%</span>
                    <span className="text-xs text-muted-foreground">cancelled</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-xs font-medium text-muted-foreground">No data yet</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5 max-w-[180px]">
                  Stats appear once bookings come in
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staffing forecast — standing tile (was carousel slide) */}
        <Card className="border-border/40 shadow-none">
          <CardHeader className="pb-1 flex flex-row items-center justify-between">
            <CardTitle className="eyebrow">Staffing forecast</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-brass-deep/70 dark:text-brass" />
          </CardHeader>
          <CardContent>
            {hasForecast ? (
              <>
                {busiest && (
                  <p className="text-sm mb-3">
                    Staff up{" "}
                    <span className="font-medium">
                      {new Date(`${busiest.date}T12:00:00Z`).toLocaleDateString(business.locale, { weekday: "long", timeZone: "UTC" })}
                    </span>
                  </p>
                )}
                <div className="flex gap-2">
                  {next3.map((day) => {
                    const dow = new Date(`${day.date}T12:00:00Z`).toLocaleDateString(business.locale, { weekday: "short", timeZone: "UTC" });
                    const isBusiest = busiest && day.date === busiest.date;
                    return (
                      <div
                        key={day.date}
                        className={cn(
                          "flex-1 rounded-lg p-2.5 text-center",
                          isBusiest ? "bg-lager/25" : "bg-muted/50",
                        )}
                      >
                        <p className="text-xs text-muted-foreground">{dow}</p>
                        <p className="figures text-2xl leading-tight mt-0.5">
                          {Math.round(day.predicted_reservations)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Run the ML pipeline to see demand predictions.
                </p>
                <Link href="/business/insights">
                  <Button variant="outline" size="sm" className="text-xs">
                    Run <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quiet actions row (was carousel slides 1–2) ───────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 fade-rise" style={{ animationDelay: "160ms" }}>
        {docsAssistantEnabled && <button
          onClick={() => setChatOpen(true)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Ask the docs assistant
        </button>}
        <Link
          href={`/reserve/${business.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Share2 className="h-4 w-4" />
          View your booking page
        </Link>
      </div>

      {/* Hidden chat sheet — opened from the actions row */}
      {docsAssistantEnabled && <BusinessDocsChatTrigger open={chatOpen} onOpenChange={setChatOpen} hideTrigger />}
    </div>
  );
}
