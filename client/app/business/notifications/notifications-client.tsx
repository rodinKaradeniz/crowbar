"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageBody, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { formatBusinessDateTime } from "@/lib/business-time";
import {
  clientCompleteDataRequest,
  clientGetVenueNotifications,
} from "@/lib/client-api";
import { cn } from "@/lib/utils";
import type { VenueNotification } from "@/types";

const PAGE_SIZE = 50;

/**
 * Filters are groups of kinds, the way an operator thinks about them, rather
 * than one chip per kind string. Every kind `notify_business_staff` writes is
 * in exactly one group; "All" is no filter at all, so a kind added later still
 * shows up there before anyone names it here.
 */
const FILTERS: { key: string; label: string; kinds: string[]; privacy?: true }[] = [
  { key: "all", label: "All", kinds: [] },
  { key: "privacy", label: "Guest data requests", kinds: ["customer_data_request"], privacy: true },
  {
    key: "bookings",
    label: "Bookings",
    kinds: ["reservation_created", "reservation_updated", "reservation_cancelled", "waitlist_expired"],
  },
  { key: "queue", label: "Walk-in queue", kinds: ["queue_join", "queue_leave", "queue_called"] },
  { key: "stock", label: "Stock", kinds: ["inventory_low_stock", "inventory_cost_change"] },
];

const REQUEST_LABEL: Record<string, string> = {
  export: "Copy of their data",
  correction: "Correction",
  deletion: "Deletion",
};

export function NotificationsClient({
  timezone,
  locale,
  canCompletePrivacy,
}: {
  timezone: string;
  locale?: string;
  canCompletePrivacy: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<VenueNotification[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<VenueNotification | null>(null);

  const load = useCallback(
    async (offset: number) => {
      const kinds = FILTERS.find((f) => f.key === filter)?.kinds ?? [];
      try {
        const page = await clientGetVenueNotifications({ kinds, limit: PAGE_SIZE, offset });
        setItems((current) => (offset === 0 ? page : [...current, ...page]));
        setHasMore(page.length === PAGE_SIZE);
        setLoadError(null);
      } catch (error) {
        setLoadError(
          error instanceof Error ? error.message : "Could not load the venue's notifications",
        );
      } finally {
        setLoaded(true);
      }
    },
    [filter],
  );

  useEffect(() => {
    setLoaded(false);
    void load(0);
  }, [load]);

  async function complete(item: VenueNotification) {
    if (!item.dataRequest) return;
    try {
      await clientCompleteDataRequest(item.dataRequest.id);
      toast.success("Request marked complete.");
      await load(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark the request complete");
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Everything the venue was told, newest first. A guest data request stays open here until someone marks it complete."
      />

      <PageBody>
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter notifications">
          {FILTERS.filter((f) => !f.privacy || canCompletePrivacy).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "type-label h-[var(--control-desktop-min)] rounded-[var(--radius-3)] border px-3 transition-colors",
                filter === f.key
                  ? "border-border-strong bg-accent text-foreground"
                  : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loadError ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 border-l-2 border-critical-fill bg-critical-tint px-4 py-3">
            <p className="flex-1 text-[length:var(--ui-size)] text-critical-text">{loadError}</p>
            <Button variant="secondary" size="filter" onClick={() => void load(0)}>
              Retry
            </Button>
          </div>
        ) : null}

        {!loaded ? (
          <SkeletonList rows={6} columns={["w-[40%]", "w-[30%]", "w-[15%]"]} />
        ) : !loadError && items.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description={
              filter === "all"
                ? "Bookings, walk-ins, stock warnings and guest data requests appear here as they happen."
                : "Nothing of this kind has reached the venue."
            }
          />
        ) : (
          <ul className="flex flex-col border-t border-border-strong">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-border py-4"
              >
                <div className="min-w-0 flex-[1_1_20rem]">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">{item.body}</p>
                  <p className="mt-1 font-mono text-[length:var(--micro-size)] text-muted-foreground">
                    {formatBusinessDateTime(item.createdAt, timezone, locale)}
                  </p>
                </div>
                {item.dataRequest ? (
                  <DataRequestState
                    item={item}
                    timezone={timezone}
                    locale={locale}
                    canComplete={canCompletePrivacy}
                    onComplete={() => setCompleting(item)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {loaded && hasMore ? (
          <Button variant="secondary" className="mt-6" onClick={() => void load(items.length)}>
            Show older
          </Button>
        ) : null}
      </PageBody>

      <ConfirmationDialog
        open={completing !== null}
        onOpenChange={(open) => {
          if (!open) setCompleting(null);
        }}
        title="Mark this request complete?"
        description={
          completing?.dataRequest?.requestType === "deletion"
            ? "Only once the guest has been anonymised from their profile. Crowbar records who marked it complete and when."
            : "Confirm the guest has been given what they asked for. Crowbar records who marked it complete and when."
        }
        confirmLabel="Mark complete"
        onConfirm={() => (completing ? complete(completing) : undefined)}
      />
    </>
  );
}

function DataRequestState({
  item,
  timezone,
  locale,
  canComplete,
  onComplete,
}: {
  item: VenueNotification;
  timezone: string;
  locale?: string;
  canComplete: boolean;
  onComplete: () => void;
}) {
  const request = item.dataRequest!;
  const done = request.status === "completed";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge tone="neutral">{REQUEST_LABEL[request.requestType] ?? request.requestType}</Badge>
      <Badge tone="neutral">{done ? "Complete" : "Open"}</Badge>
      {done ? (
        <span className="text-[length:var(--ui-size)] text-muted-foreground">
          {request.completedByName ?? "Someone"}
          {request.completedAt
            ? `, ${formatBusinessDateTime(request.completedAt, timezone, locale)}`
            : null}
        </span>
      ) : null}
      <Button asChild variant="secondary" size="filter">
        <Link href={`/business/customers/${request.customerId}`}>Guest profile</Link>
      </Button>
      {!done && canComplete ? (
        <Button size="filter" onClick={onComplete}>
          Mark complete
        </Button>
      ) : null}
    </div>
  );
}
