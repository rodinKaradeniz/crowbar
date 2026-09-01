"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  clientDownloadReportCsv,
  clientGetStaffActions,
  type StaffActionsReport,
} from "@/lib/client-api";
import { EmptyState } from "@/components/empty-state";
import { ReportShell } from "@/components/reports/report-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReportRange } from "@/components/reports/report-range";

interface Props {
  range: ReportRange;
}

export function StaffActionsPanel({ range }: Props) {
  const [report, setReport] = useState<StaffActionsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await clientGetStaffActions(range));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this report");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionNames = Array.from(
    new Set((report?.actions ?? []).map((entry) => entry.action)),
  ).sort();

  return (
    <ReportShell
      title="Staff actions"
      description="Who approved spend, reconciled counts, recorded settlements and marked no-shows."
      range={range}
      loading={loading}
      error={error}
      onRetry={() => void load()}
      complete
      // The service always returns a note here rather than a failure: this is a
      // deliberately narrow list, not a general audit log, and saying so beside
      // the table stops it from being read as one.
      incompleteReason={report?.incompleteReason}
      disclosure={report?.disclosure}
      onExport={async () => {
        try {
          await clientDownloadReportCsv("staff-actions", range, "staff-actions.csv");
        } catch {
          toast.error("Could not export staff actions");
        }
      }}
    >
      {report && report.actors.length === 0 ? (
        <EmptyState
          title="No recorded actions in this range"
          description="Approvals, receiving, count reconciliation, external settlement and no-shows appear here."
        />
      ) : (
        report && (
          <>
            <div className="flex gap-[var(--space-8)] border-l-2 border-border-strong bg-secondary p-[var(--space-12)] text-[length:var(--ui-size)] text-muted-foreground">
              <p>{report.incompleteReason}</p>
            </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff member</TableHead>
                    {actionNames.map((action) => (
                      <TableHead key={action} className="text-right">
                        {action}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.actors.map((actor) => (
                    <TableRow key={actor.actorId}>
                      <TableCell>{actor.actorName}</TableCell>
                      {actionNames.map((action) => (
                        <TableCell key={action} numeric>
                          {actor.actions[action] ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell numeric>{actor.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </>
        )
      )}
    </ReportShell>
  );
}
