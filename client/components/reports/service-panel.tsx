"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  clientDownloadReportCsv,
  clientGetQueueConversion,
  clientGetReservationOutcomes,
  clientGetTableUtilization,
  type QueueConversionReport,
  type ReservationOutcomesReport,
  type TableUtilizationReport,
} from "@/lib/client-api";
import { EmptyState } from "@/components/empty-state";
import {
  FigureBand,
  ReportFigure,
  ReportShell,
} from "@/components/reports/report-shell";
import type { ReportRange } from "@/components/reports/report-range";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Props {
  range: ReportRange;
  hasQueue: boolean;
}

const percent = (value: number | null) => (value === null ? null : `${value}%`);
const minutes = (value: number | null) => (value === null ? null : `${value} min`);

export function ServicePanel({ range, hasQueue }: Props) {
  const [reservations, setReservations] = useState<ReservationOutcomesReport | null>(null);
  const [queue, setQueue] = useState<QueueConversionReport | null>(null);
  const [tables, setTables] = useState<TableUtilizationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reservationRows, tableRows] = await Promise.all([
        clientGetReservationOutcomes(range),
        clientGetTableUtilization(range),
      ]);
      setReservations(reservationRows);
      setTables(tableRows);
      // The queue report is module-gated, so a venue without it simply has no
      // queue section rather than an error.
      setQueue(hasQueue ? await clientGetQueueConversion(range) : null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load these reports");
    } finally {
      setLoading(false);
    }
  }, [range, hasQueue]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportTables = async () => {
    try {
      await clientDownloadReportCsv("tables", range, "table-utilization.csv");
    } catch {
      toast.error("Could not export table utilization");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <ReportShell
        title="Bookings and no-shows"
        description="What happened to the reservations in this range."
        range={range}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        complete={reservations?.complete ?? true}
        incompleteReason={reservations?.incompleteReason}
        disclosure={reservations?.disclosure}
      >
        {reservations && reservations.booked === 0 ? (
          <EmptyState
            title="No bookings in this range"
            description="Choose a longer range, or check that the reservations module is in use."
          />
        ) : (
          reservations && (
            <>
              <FigureBand>
                <ReportFigure label="Booked" value={reservations.booked} />
                <ReportFigure label="Covers" value={reservations.covers} />
                <ReportFigure
                  label="Completed"
                  value={reservations.completed}
                  hint={percent(reservations.completionRatePercent) ?? undefined}
                />
                <ReportFigure
                  label="No-shows"
                  value={reservations.noShows}
                  hint={percent(reservations.noShowRatePercent) ?? undefined}
                  unavailableHint="No bookings to measure against"
                />
                <ReportFigure
                  label="Cancelled"
                  value={reservations.cancelled}
                  hint={percent(reservations.cancellationRatePercent) ?? undefined}
                />
                <ReportFigure
                  label="Cancelled late"
                  value={reservations.lateCancellations}
                  hint="Inside the venue's notice window"
                />
                <ReportFigure
                  label="Reconfirmed"
                  value={reservations.reconfirmed}
                  hint="Guest confirmed after booking"
                />
              </FigureBand>
            </>
          )
        )}
      </ReportShell>

      {hasQueue && (
        <ReportShell
          title="Queue wait and seating"
          description="How long walk-ins waited, and how many of them sat down."
          range={range}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          complete={queue?.complete ?? true}
          incompleteReason={queue?.incompleteReason}
          disclosure={queue?.disclosure}
        >
          {queue && queue.joined === 0 ? (
            <EmptyState
              title="Nobody joined the queue in this range"
              description="Walk-in wait and conversion appear once parties join."
            />
          ) : (
            queue && (
              <FigureBand>
                <ReportFigure label="Joined" value={queue.joined} />
                <ReportFigure
                  label="Seated"
                  value={queue.seated}
                  hint={percent(queue.seatingConversionPercent) ?? undefined}
                />
                <ReportFigure label="Left the queue" value={queue.removed} />
                <ReportFigure
                  label="Median wait"
                  value={minutes(queue.medianWaitMinutes)}
                  unavailableHint="No party was seated from the queue"
                />
                <ReportFigure
                  label="Average wait"
                  value={minutes(queue.averageWaitMinutes)}
                  unavailableHint="No party was seated from the queue"
                />
                <ReportFigure
                  label="Longest wait"
                  value={minutes(queue.longestWaitMinutes)}
                  unavailableHint="No party was seated from the queue"
                />
                <ReportFigure
                  label="Waitlist offers"
                  value={queue.waitlistOffers}
                  hint={
                    percent(queue.waitlistAcceptancePercent)
                      ? `${percent(queue.waitlistAcceptancePercent)} accepted`
                      : undefined
                  }
                />
              </FigureBand>
            )
          )}
        </ReportShell>
      )}

      <ReportShell
        title="Table use and turn time"
        description="Seatings and covers per table. Turn time counts only closed seatings."
        range={range}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        complete={tables?.complete ?? true}
        incompleteReason={tables?.incompleteReason}
        disclosure={tables?.disclosure}
        onExport={exportTables}
      >
        {tables && tables.tables.length === 0 ? (
          <EmptyState
            title="No seatings in this range"
            description="Turn time appears once tables have been opened and closed on Floor."
          />
        ) : (
          tables && (
            <>
              <FigureBand>
                <ReportFigure label="Seatings" value={tables.seatings} />
                <ReportFigure label="Covers" value={tables.covers} />
                {Object.entries(tables.bySource).map(([source, entry]) => (
                  <ReportFigure
                    key={source}
                    label={source === "reservation" ? "From bookings" : "Walk-ins"}
                    value={entry.seatings}
                    hint={`${entry.covers} covers`}
                  />
                ))}
              </FigureBand>

              <Table>
                <colgroup>
                  <col />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Seatings</TableHead>
                    <TableHead className="text-right">Covers</TableHead>
                    <TableHead className="text-right">Average turn</TableHead>
                    <TableHead className="text-right">Still open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.tables.map((row) => (
                    <TableRow key={row.tableId}>
                      <TableCell>{row.tableName}</TableCell>
                      <TableCell numeric>{row.seatings}</TableCell>
                      <TableCell numeric>{row.covers}</TableCell>
                      <TableCell numeric>
                        {row.averageTurnMinutes === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          `${row.averageTurnMinutes} min`
                        )}
                      </TableCell>
                      <TableCell numeric>{row.stillOpen || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )
        )}
      </ReportShell>
    </div>
  );
}
