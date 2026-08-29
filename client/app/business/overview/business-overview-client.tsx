"use client";

import Link from "next/link";
import { useMemo } from "react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Figure } from "@/components/ui/figure";
import { useRegionalSettings } from "@/contexts/regional-context";
import { useServiceClock } from "@/hooks/use-service-clock";
import type { BusinessDashboardStats } from "@/lib/api-client";
import {
  formatBusinessServiceDay,
  formatBusinessTime,
} from "@/lib/business-time";
import type { MLDemandForecastResult } from "@/lib/ml-api";
import { formatMoney } from "@/lib/money";
import { bookingLateSeverity } from "@/lib/severity";
import type { Business, ServiceType } from "@/types";
import { cn } from "@/lib/utils";

interface BusinessOverviewClientProps {
  business: Business;
  stats: BusinessDashboardStats;
  serviceTypes: ServiceType[];
  demandForecast?: MLDemandForecastResult | null;
  /** customer id → name. Empty when the role may not see guest records. */
  guestNames: Record<string, string>;
}

/**
 * Overview — §05 of the Dashboard canvas.
 *
 * Figure band → demand forecast → "Arriving next". Ruled, not carded: the
 * hairlines between cells do the work a border-radius and a shadow used to.
 *
 * WHAT IS NOT HERE. The canvas's right-hand "Right now" feed has no backing:
 * no live event feed exists, and `reporting_service.staff_actions` is a range
 * report that `docs/PRODUCT.md` deliberately does not make into an audit log.
 * The column is not rendered rather than assembled from things that look like
 * events. Recorded in `docs/TODO.md` §7a.
 *
 * The month-over-month change used to render in destructive red here. That is
 * §08's named non-qualifying case, verbatim — a number being lower than someone
 * hoped is never critical — so it now reads as a neutral line under the
 * forecast, where a trend belongs.
 */
export default function BusinessOverviewClient({
  business,
  stats,
  serviceTypes,
  demandForecast,
  guestNames,
}: BusinessOverviewClientProps) {
  const { locale, currencyCode, timezone } = useRegionalSettings();
  const { now, ready } = useServiceClock();
  const ops = stats.ops ?? {};

  const forecastDays = useMemo(() => {
    if (demandForecast?.status !== "success" || !demandForecast.forecasts) {
      return [];
    }
    return Object.values(demandForecast.forecasts)
      .flat()
      .slice(0, 7)
      .map((day) => ({
        date: day.date,
        covers: Math.round(day.predicted_reservations),
      }));
  }, [demandForecast]);

  const forecastTotal = forecastDays.reduce((sum, day) => sum + day.covers, 0);
  const peak = forecastDays.reduce<{ date: string; covers: number } | null>(
    (best, day) => (best && best.covers >= day.covers ? best : day),
    null,
  );

  const averageTab =
    ops.orders_today && ops.ordered_value_today !== undefined && ops.orders_today > 0
      ? ops.ordered_value_today / ops.orders_today
      : null;

  return (
    <div className="pb-[clamp(32px,4vw,56px)]">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] border-b border-border">
        <FigureCell>
          <Figure
            size="headline"
            label="Guests expected"
            value={stats.today_guest_count || null}
            comparison={`${stats.today_reservations} bookings on the book`}
          />
        </FigureCell>

        {ops.orders_today !== undefined ? (
          <FigureCell>
            <Figure
              size="headline"
              label="Orders placed"
              value={ops.orders_today || null}
              comparison={
                ops.open_tabs !== undefined
                  ? `${ops.open_tabs} tabs still open`
                  : undefined
              }
            />
          </FigureCell>
        ) : null}

        {ops.ordered_value_today !== undefined ? (
          <FigureCell>
            {/* "Ordered today", never "revenue": nothing here has been
                collected, and Crowbar does not take the money. */}
            <Figure
              size="headline"
              label="Ordered today"
              value={
                ops.ordered_value_today
                  ? formatMoney(ops.ordered_value_today, currencyCode, locale)
                  : null
              }
              comparison={
                averageTab
                  ? `${formatMoney(averageTab, currencyCode, locale)} average tab`
                  : undefined
              }
            />
          </FigureCell>
        ) : null}

        <FigureCell last>
          <Figure
            size="headline"
            label="Next 7 nights"
            value={forecastTotal || null}
            comparison="forecast covers"
          />
        </FigureCell>
      </div>

      <div className="flex flex-wrap items-stretch">
        <section className="min-w-[min(100%,420px)] flex-[1_1_560px]">
          <ForecastPanel
            days={forecastDays}
            peak={peak}
            monthChange={stats.month_change}
            locale={locale}
            timezone={timezone}
          />

          <ArrivingNext
            stats={stats}
            serviceTypes={serviceTypes}
            guestNames={guestNames}
            locale={locale}
            timezone={timezone}
            businessName={business.name}
            now={now}
            clockReady={ready}
          />
        </section>
      </div>
    </div>
  );
}

function FigureCell({
  children,
  last = false,
}: {
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "px-[clamp(16px,2.5vw,32px)] py-[22px]",
        !last && "border-r border-border",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The seven-night forecast. Tonight is the brand bar; every other night is a
 * neutral fill, including the busiest one. **A busy night is not a severity.**
 */
function ForecastPanel({
  days,
  peak,
  monthChange,
  locale,
  timezone,
}: {
  days: { date: string; covers: number }[];
  peak: { date: string; covers: number } | null;
  monthChange: number;
  locale: string;
  timezone: string;
}) {
  const ceiling = days.reduce((max, day) => Math.max(max, day.covers), 0);

  return (
    <div className="border-b border-border px-[clamp(16px,2.5vw,32px)] py-[22px]">
      <h2 className="type-t2 mb-5">Demand forecast</h2>

      {days.length === 0 ? (
        <p className="text-[length:var(--ui-size)] text-muted-foreground">
          No forecast yet. Crowbar needs a few weeks of your own service history
          before it will put a number on a night.
        </p>
      ) : (
        <>
          <div className="flex h-[132px] items-end gap-[clamp(6px,1.2vw,14px)] border-b border-border">
            {days.map((day, index) => (
              <div
                key={day.date}
                className="flex h-full flex-1 flex-col items-center justify-end gap-[7px]"
              >
                <span
                  className={cn(
                    "font-mono text-[11.5px] tabular-nums",
                    index === 0
                      ? "bg-primary px-1 py-px font-semibold text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {day.covers}
                </span>
                <span
                  className={index === 0 ? "w-full bg-primary" : "w-full bg-border-strong"}
                  style={{
                    height: ceiling > 0 ? `${(day.covers / ceiling) * 100}%` : "0%",
                  }}
                  aria-hidden
                />
              </div>
            ))}
          </div>

          <div className="flex gap-[clamp(6px,1.2vw,14px)] pt-2">
            {days.map((day, index) => (
              <span
                key={day.date}
                className={cn(
                  "flex-1 text-center font-mono text-[10px] tracking-[0.1em] uppercase",
                  index === 0 ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {index === 0
                  ? "Tonight"
                  : formatBusinessServiceDay(day.date, timezone, locale).split(
                      ",",
                    )[0]}
              </span>
            ))}
          </div>

          {peak ? (
            <p className="mt-3.5 text-[13.5px] text-muted-foreground text-pretty">
              <strong className="font-semibold text-foreground">
                {formatBusinessServiceDay(peak.date, timezone, locale)},{" "}
                {peak.covers} covers.
              </strong>{" "}
              The busiest of the seven. Roster and order against it — a note for
              the office, not for tonight.
            </p>
          ) : null}
        </>
      )}

      {/* Neutral. A month-over-month change has a deadline weeks away; §08
          names it as the case that does not qualify for a severity. */}
      {monthChange !== 0 ? (
        <p className="mt-2.5 font-mono text-[11.5px] tabular-nums text-muted-foreground">
          {monthChange > 0 ? "+" : ""}
          {monthChange}% bookings vs last month
        </p>
      ) : null}
    </div>
  );
}

/**
 * The next arrivals, as a table.
 *
 * Two attend states are real and derivable: a party with no table assigned, and
 * a booking running late. Both get the hairline-to-filled badge and NOT a
 * tinted row — attend is subordinate, never a full row background.
 */
function ArrivingNext({
  stats,
  serviceTypes,
  guestNames,
  locale,
  timezone,
  businessName,
  now,
  clockReady,
}: {
  stats: BusinessDashboardStats;
  serviceTypes: ServiceType[];
  guestNames: Record<string, string>;
  locale: string;
  timezone: string;
  businessName: string;
  now: number;
  clockReady: boolean;
}) {
  const rows = stats.upcoming_reservations.slice(0, 6);
  const showNames = Object.keys(guestNames).length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-[clamp(16px,2.5vw,32px)] pt-[22px] pb-1.5">
        <h2 className="type-t2">Arriving next</h2>
        <Link
          href="/business/reservations"
          className="type-label text-text-on-ink-faint hover:text-primary"
        >
          Full book →
        </Link>
      </div>

      <div className="px-[clamp(16px,2.5vw,32px)] pb-6">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing on the book yet"
            description={`When guests book ${businessName} or join the queue, the next arrivals show here in the order they are due.`}
            action={{ label: "Take a booking", href: "/business/reservations" }}
          />
        ) : (
          <>
            <div className="type-micro flex items-center gap-3 border-b border-border-strong px-1 pb-2 text-muted-foreground">
              <span className="w-12">Time</span>
              <span className="flex-1">{showNames ? "Guest" : "Booking"}</span>
              <span className="w-[38px] text-right">Party</span>
              <span className="w-[52px] text-right">Table</span>
              <span className="w-[104px] text-right">Status</span>
            </div>

            {rows.map((row) => (
              <ArrivalRow
                key={row.id}
                row={row}
                name={showNames ? guestNames[row.customer_id] : undefined}
                serviceTypeName={
                  serviceTypes.find((type) => type.id === row.service_type_id)
                    ?.name
                }
                locale={locale}
                timezone={timezone}
                now={now}
                clockReady={clockReady}
              />
            ))}

            {/* Only claims the "of N" when N actually covers these rows.
                `today_reservations` counts the service day; the arrivals list
                runs past it into tomorrow, so "5 of 0 bookings" was possible
                and is nonsense on a screen someone reads at a glance. */}
            <p className="mt-3 px-1 font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
              {stats.today_reservations >= rows.length
                ? `${rows.length} of ${stats.today_reservations} bookings · ${stats.today_guest_count} covers on the book`
                : `Next ${rows.length} ${rows.length === 1 ? "arrival" : "arrivals"}`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ArrivalRow({
  row,
  name,
  serviceTypeName,
  locale,
  timezone,
  now,
  clockReady,
}: {
  row: BusinessDashboardStats["upcoming_reservations"][number];
  name?: string;
  serviceTypeName?: string;
  locale: string;
  timezone: string;
  now: number;
  clockReady: boolean;
}) {
  // Lateness is derivable from the booked time. It waits for the client clock:
  // the server cannot know "now", and a stale badge behind the bar is worse
  // than a plain status for the moment before hydration.
  const minutesLate = Math.floor((now - new Date(row.time).getTime()) / 60_000);
  const isLate =
    clockReady &&
    row.status !== "completed" &&
    bookingLateSeverity(minutesLate) === "attend";

  return (
    <div className="flex items-center gap-3 border-b border-surface-3 px-1 py-[13px] text-[length:var(--ui-size)] transition-colors hover:bg-sidebar">
      <span className="w-12 font-mono text-[13px] tabular-nums text-muted-foreground">
        {formatBusinessTime(row.time, timezone, locale)}
      </span>

      <span className="flex-1 truncate font-medium">
        {name ?? "Booking"}
        {serviceTypeName ? (
          <span className="type-micro ml-2.5 text-text-on-ink-faint">
            {serviceTypeName}
          </span>
        ) : null}
      </span>

      <span className="w-[38px] text-right font-mono text-[13px] tabular-nums">
        {row.guests}
      </span>

      {/* The booking payload carries no table assignment, so this is an
          em-dash for every row rather than a guess. Bringing "no table" — a
          real attend case — onto this screen needs the table id on
          `upcoming_reservations`. Recorded in docs/TODO.md §7a. */}
      <span className="w-[52px] text-right font-mono text-[13px] text-text-on-ink-faint">
        —
      </span>

      <span className="flex w-[104px] justify-end">
        {isLate ? (
          <Badge tone="attend">{minutesLate} Min late</Badge>
        ) : (
          <Badge tone="neutral">{row.status}</Badge>
        )}
      </span>
    </div>
  );
}
