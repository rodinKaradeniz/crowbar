"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { TableQrCode } from "@/components/table-qr-code";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { clientListFloorPlanTableQrs } from "@/lib/client-api";
import { failureSeverity } from "@/lib/severity";
import type { FloorPlanTableQrSheet } from "@/types";

/**
 * The sheet a venue prints once and cuts up.
 *
 * WHY THIS PAGE EXISTS. The table panel on Floor hands out one QR link at a
 * time, into a read-only field with a copy button. That is a clipboard, and a
 * bar cannot put a clipboard on a table. Twenty tables needed twenty round
 * trips and produced nothing you could stick to anything.
 *
 * IT RENDERS ON PAPER, INSIDE AN INK PRODUCT. `.ground-paper` re-grounds the
 * sheet and everything in it — see the print block in `globals.css` for why a
 * staff route is the one surface that does this. On screen it reads as a paper
 * document lying on the workspace; on paper it is simply correct, instead of
 * pushing a black page through the venue's printer.
 *
 * THE ORIGIN COMES FROM THE BROWSER, DELIBERATELY. The API returns a relative
 * URL and this page resolves it against `window.location.origin`, exactly as
 * the single-table dialog does. A sheet printed from a laptop on localhost
 * therefore encodes localhost — correct behaviour rather than a bug, and the
 * reason the page says out loud which address it is about to print.
 *
 * NO OFFLINE BAR. The other six-state surfaces carry one because they hold a
 * live board over a WebSocket and a stale board is dangerous. This is a single
 * read with nothing arriving after it, so a failed load IS the connection
 * state, and it is handled below with a retry.
 */
export default function QrSheetClient() {
  const [sheet, setSheet] = useState<FloorPlanTableQrSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setSheet(await clientListFloorPlanTableQrs());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const tableCount =
    sheet?.areas.reduce((total, area) => total + area.tables.length, 0) ?? 0;

  return (
    <>
      <PageHeader
        above={
          <Link
            href="/business/floor"
            className="type-label inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden />
            Floor map
          </Link>
        }
        title="Table QR codes"
        description={
          origin
            ? `One card per table, encoding ${origin}. Print, cut, and put each card on its table.`
            : "One card per table. Print, cut, and put each card on its table."
        }
        actions={
          <Button
            variant="secondary"
            size="filter"
            className="min-w-[var(--control-desktop-min)]"
            onClick={() => window.print()}
            disabled={loading || failed || tableCount === 0}
          >
            <Printer aria-hidden />
            Print
          </Button>
        }
      />

      <PageBody className="print-sheet">
        {loading ? <SheetSkeleton /> : null}

        {!loading && failed ? (
          // A failed load is "a thing that is broken right now" — the rank says
          // critical, and always with a route out. Asked of lib/severity.ts
          // rather than decided here.
          <div
            role="alert"
            data-severity={failureSeverity(true)}
            className="flex flex-wrap items-center justify-between gap-[var(--space-12)] border-l-2 border-critical-fill bg-critical-tint p-[var(--space-16)]"
          >
            <p className="text-[length:var(--ui-size)] text-critical-text">
              The table QR codes could not be loaded. Nothing was changed, and no
              code was rotated.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="filter"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {!loading && !failed && sheet && tableCount === 0 ? (
          <EmptyState
            title="There are no tables to print"
            description="Tables get their QR codes as soon as they exist. Add an area and its tables on the floor map first."
            action={{ label: "Open the floor map", href: "/business/floor" }}
          />
        ) : null}

        {!loading && !failed && sheet && tableCount > 0 ? (
          <div className="print-sheet-page ground-paper flex flex-col gap-[var(--space-24)] border border-border bg-background p-[var(--space-24)] text-foreground">
            {sheet.areas.map((area) => (
              <section key={area.id} className="print-sheet-area">
                <h2 className="type-label print-sheet-area-name text-muted-foreground">
                  {area.name}
                </h2>
                <div className="print-sheet-grid mt-[var(--space-12)] grid grid-cols-3 gap-[var(--space-16)]">
                  {area.tables.map((table) => {
                    // The one place the printed address is decided, and it is
                    // the same expression the single-table dialog uses.
                    const absoluteUrl = new URL(
                      table.url,
                      window.location.origin,
                    ).toString();

                    return (
                      <article
                        key={table.tableId}
                        data-table-label={table.label}
                        data-qr-url={absoluteUrl}
                        className="print-sheet-card flex flex-col items-center gap-[var(--space-8)] border border-border p-[var(--space-16)] text-center"
                      >
                        <p className="type-t1">{table.label}</p>
                        <TableQrCode
                          value={absoluteUrl}
                          title={`Ordering code for table ${table.label}`}
                          className="w-full max-w-[var(--print-qr-size)]"
                        />
                        <p className="type-label text-muted-foreground">
                          {sheet.businessName}
                        </p>
                        {/* The revision is how someone holding two cards for
                            the same table can tell which one still works. */}
                        <p className="type-micro text-muted-foreground">
                          rev {table.revision}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </PageBody>
    </>
  );
}

/** Mirrors the card grid it replaces, so nothing reflows when the sheet lands. */
function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-[var(--space-24)]">
      <Skeleton className="h-3 w-24" />
      <div className="grid grid-cols-3 gap-[var(--space-16)]">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} index={index} className="h-56" />
        ))}
      </div>
    </div>
  );
}
