"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { OfflineBar } from "@/components/offline-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Figure } from "@/components/ui/figure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRegionalSettings } from "@/contexts/regional-context";
import { useServiceClock } from "@/hooks/use-service-clock";
import { useTabSocket } from "@/hooks/use-tab-socket";
import { formatBusinessDateTime } from "@/lib/business-time";
import {
  clientGetTab,
  clientListTabs,
  clientReopenTab,
  clientSettleTabExternally,
} from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { openTabSeverity } from "@/lib/severity";
import { cn } from "@/lib/utils";
import type { Tab, TabSettledMethod } from "@/types";
import { TabOrderCompose } from "./tab-order-compose";

const METHODS: Array<{ value: TabSettledMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "mixed", label: "Mixed" },
  { value: "other", label: "Other" },
];

/**
 * Tabs.
 *
 * THE SETTLEMENT LANGUAGE IS LEGAL, NOT EDITORIAL, and it was already right
 * here — it is preserved word for word. Crowbar does not take payment, run a
 * till, or issue any fiscal document. The venue's own register is the payment
 * and fiscal authority; what Crowbar records is a staff assertion that
 * settlement completed, with a name and a timestamp. There is no tender, no
 * receipt, no green tick.
 *
 * Severity: a lost connection gets the offline bar (critical). A tab still open
 * from an earlier service day is ATTEND — it is the design's own example, and
 * it is derivable here by comparing the tab's business-local open date to
 * today's. Everything else on this screen is neutral, including the amount.
 */
export function TabsClient({
  businessId,
  businessTimezone,
  canReopen,
}: {
  businessId: string;
  businessTimezone: string;
  canReopen: boolean;
}) {
  const { currencyCode, locale } = useRegionalSettings();
  const { now, ready } = useServiceClock();
  const money = (value: number | string) =>
    formatMoney(value, currencyCode, locale);

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [method, setMethod] = useState<TabSettledMethod | "not_recorded">(
    "not_recorded",
  );
  const [note, setNote] = useState("");
  const [registerReference, setRegisterReference] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const requestedTabId = useSearchParams().get("tab");
  const selected = tabs.find((tab) => tab.id === selectedId) ?? null;

  const refreshTabs = useCallback(async () => {
    try {
      setTabs(await clientListTabs());
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load tabs",
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refreshTabs();
  }, [refreshTabs]);

  const { connected, lastContactAt } = useTabSocket(businessId, refreshTabs);

  const upsertTab = useCallback(
    (tab: Tab) =>
      setTabs((current) => {
        const found = current.findIndex((candidate) => candidate.id === tab.id);
        if (found < 0) return [tab, ...current];
        const next = [...current];
        next[found] = tab;
        return next;
      }),
    [],
  );

  const refreshTab = useCallback(
    async (tabId: string) => {
      setBusy(true);
      try {
        upsertTab(await clientGetTab(tabId));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not refresh the tab",
        );
      } finally {
        setBusy(false);
      }
    },
    [upsertTab],
  );

  useEffect(() => {
    if (!requestedTabId) return;
    setSelectedId(requestedTabId);
    void refreshTab(requestedTabId);
  }, [refreshTab, requestedTabId]);

  async function settle() {
    if (!selected) return;
    setBusy(true);
    try {
      const tab = await clientSettleTabExternally(selected.id, {
        idempotencyKey: crypto.randomUUID(),
        informationalMethod: method === "not_recorded" ? undefined : method,
        note: note.trim() || undefined,
        externalRegisterReference: registerReference.trim() || undefined,
      });
      upsertTab(tab);
      setSettleOpen(false);
      toast.success("External settlement recorded.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not record external settlement",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!selected || !reopenReason.trim()) return;
    setBusy(true);
    try {
      const tab = await clientReopenTab(
        selected.id,
        reopenReason.trim(),
        crypto.randomUUID(),
      );
      upsertTab(tab);
      setReopenOpen(false);
      setReopenReason("");
      toast.success("Tab reopened. The earlier settlement record stays in history.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not reopen the tab",
      );
    } finally {
      setBusy(false);
    }
  }

  const staleness = (tab: Tab) =>
    openTabSeverity(
      tab.status,
      ready && openedOnAnEarlierServiceDay(tab.openedAt, now, businessTimezone),
    );

  return (
    <>
      <OfflineBar
        connected={connected}
        lastContactAt={lastContactAt}
        surface="Tabs"
        onRetry={() => void refreshTabs()}
      />

      <div className="px-[clamp(16px,2.5vw,32px)] py-6">
        <div className="mb-6">
          <h1 className="type-t1">Tabs</h1>
          <p className="mt-1 text-[length:var(--ui-size)] text-muted-foreground">
            What each table ordered, and what it comes to. Your register does the
            settling.
          </p>
        </div>

        {loadError ? (
          <div className="mb-6 flex flex-wrap items-center gap-3 border-l-2 border-critical-fill bg-critical-tint px-4 py-3">
            <p className="flex-1 text-[length:var(--ui-size)] text-critical-text">
              {loadError}
            </p>
            <Button variant="secondary" size="filter" onClick={() => void refreshTabs()}>
              Retry
            </Button>
          </div>
        ) : null}

        {!loaded ? (
          <p className="text-[length:var(--ui-size)] text-muted-foreground">
            Loading tabs…
          </p>
        ) : tabs.length === 0 ? (
          <EmptyState
            title="No tabs open"
            description="A tab opens when a table orders, and stays open until the party closes out. Start one from an occupied table on the floor map."
            action={{ label: "Open the floor map", href: "/business/floor" }}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-[280px_1fr]">
            <div className="flex flex-col border-t border-border-strong">
              {tabs.map((tab) => {
                const severity = staleness(tab);
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedId(tab.id)}
                    aria-current={tab.id === selectedId ? "true" : undefined}
                    className={cn(
                      "border-b border-border p-3 text-left transition-colors",
                      tab.id === selectedId
                        ? "bg-accent shadow-[inset_2px_0_0_var(--primary)]"
                        : "hover:bg-accent",
                      severity === "attend" && "bg-attend-tint",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] text-muted-foreground">
                        #{tab.id.slice(0, 8)}
                      </span>
                      {tab.status === "open" ? (
                        severity === "attend" ? (
                          <Badge tone="attend">Since last night</Badge>
                        ) : (
                          <Badge tone="neutral">Open</Badge>
                        )
                      ) : (
                        <Badge tone="neutral">Settled</Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-[13px] text-muted-foreground">
                        {tab.orders.length} order
                        {tab.orders.length === 1 ? "" : "s"}
                      </span>
                      <span className="font-mono text-[length:var(--data-size)] font-semibold tabular-nums">
                        {money(tab.total)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {selected ? (
              <section className="border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
                  <div>
                    <h2 className="type-t2 font-mono">
                      Tab #{selected.id.slice(0, 8)}
                    </h2>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Opened{" "}
                      {formatBusinessDateTime(
                        selected.openedAt,
                        businessTimezone,
                        locale,
                      )}
                      {selected.seatingId ? " · seating tab" : " · standalone tab"}
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="filter"
                      onClick={() => void refreshTab(selected.id)}
                      disabled={busy}
                    >
                      Refresh
                    </Button>
                    {selected.status === "open" ? (
                      <>
                        <Button
                          variant="secondary"
                          size="filter"
                          onClick={() => setComposeOpen(true)}
                        >
                          Add order
                        </Button>
                        <Button
                          size="filter"
                          onClick={() => {
                            setMethod("not_recorded");
                            setNote("");
                            setRegisterReference("");
                            setSettleOpen(true);
                          }}
                        >
                          Settle externally
                        </Button>
                      </>
                    ) : null}
                    {selected.status === "settled_externally" && canReopen ? (
                      <Button
                        variant="secondary"
                        size="filter"
                        onClick={() => setReopenOpen(true)}
                      >
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="border-b border-border p-4">
                  <Figure
                    label={selected.status === "open" ? "Running" : "Tab total"}
                    value={money(selected.total)}
                  />
                </div>

                {selected.orders.length === 0 ? (
                  <p className="p-4 text-[length:var(--ui-size)] text-muted-foreground">
                    Nothing on this tab yet.
                  </p>
                ) : (
                  <ul className="m-0 list-none p-0">
                    {selected.orders.map((order) => (
                      <li key={order.id} className="border-b border-border p-4">
                        <div className="flex items-center justify-between gap-2">
                          <Badge tone="neutral">{order.status}</Badge>
                          <span className="font-mono text-[length:var(--data-size)] font-medium tabular-nums">
                            {money(order.totalAmount)}
                          </span>
                        </div>
                        <ul className="m-0 mt-2 list-none p-0">
                          {order.lineItems.map((line) => (
                            <li
                              key={line.id}
                              className="flex justify-between gap-3 py-1 text-[length:var(--ui-size)] text-muted-foreground"
                            >
                              <span>
                                {line.quantity}× {line.itemName}
                              </span>
                              <span className="font-mono tabular-nums">
                                {money(line.unitPrice * line.quantity)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}

                {selected.settlementEvents.length > 0 ? (
                  <div className="p-4">
                    <p className="type-micro mb-3 text-muted-foreground">
                      Settlement history
                    </p>
                    {selected.settlementEvents.map((event) => (
                      <div
                        key={event.id}
                        className="border-b border-surface-3 py-3 last:border-0"
                      >
                        <div className="flex justify-between gap-3">
                          <span className="text-[length:var(--ui-size)] font-medium">
                            {event.eventType === "settled_externally"
                              ? "Settled externally"
                              : "Reopened"}
                          </span>
                          <span className="font-mono text-[12.5px] tabular-nums text-muted-foreground">
                            {formatBusinessDateTime(
                              event.occurredAt,
                              businessTimezone,
                              locale,
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          Snapshot: {money(event.totalSnapshot)}{" "}
                          {event.currencyCode}
                          {event.informationalMethod
                            ? ` · ${event.informationalMethod}`
                            : ""}
                          {event.externalRegisterReference
                            ? ` · register ${event.externalRegisterReference}`
                            : ""}
                        </p>
                        {event.note ? (
                          <p className="mt-1 text-[13px] text-muted-foreground">
                            {event.note}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : (
              <p className="flex items-center justify-center border border-border p-8 text-[length:var(--ui-size)] text-muted-foreground">
                Pick a tab to see what is on it.
              </p>
            )}
          </div>
        )}
      </div>

      {selected?.status === "open" ? (
        <TabOrderCompose
          businessId={businessId}
          tabId={selected.id}
          open={composeOpen}
          onOpenChange={setComposeOpen}
          onAdded={() => refreshTab(selected.id)}
        />
      ) : null}

      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Record that the register settled{" "}
              {selected ? money(selected.total) : ""}?
            </DialogTitle>
            <DialogDescription>
              Crowbar does not process this payment or issue a receipt. Your
              register does the settling; this records that a member of staff
              says it completed, with their name and the time.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div>
              <Label className="mb-[7px]">Method</Label>
              <Select
                value={method}
                onValueChange={(value) =>
                  setMethod(value as TabSettledMethod | "not_recorded")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_recorded">Not recorded</SelectItem>
                  {METHODS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-[12.5px] text-muted-foreground">
                Context only. It is not a tender or an amount in Crowbar.
              </p>
            </div>

            <div>
              <Label htmlFor="register-reference" className="mb-[7px]">
                Register reference
              </Label>
              <Input
                id="register-reference"
                placeholder="Optional"
                value={registerReference}
                onChange={(event) => setRegisterReference(event.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="settle-note" className="mb-[7px]">
                Note
              </Label>
              <Textarea
                id="settle-note"
                placeholder="Optional"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setSettleOpen(false)}>
              Not yet
            </Button>
            <Button onClick={() => void settle()} disabled={busy}>
              Record it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen this tab?</DialogTitle>
            <DialogDescription>
              The earlier settlement record stays exactly as it is and cannot be
              changed. Reopening lets the tab take more orders while its seating
              is still open.
            </DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="reopen-reason" className="mb-[7px]">
              Why
            </Label>
            <Textarea
              id="reopen-reason"
              placeholder="Required — this is audited"
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button onClick={() => setReopenOpen(false)}>Leave it closed</Button>
            <Button
              variant="destructive-quiet"
              onClick={() => void reopen()}
              disabled={busy || !reopenReason.trim()}
            >
              Reopen the tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * True when a tab was opened on an earlier business-local day than today.
 *
 * This is the derivable half of "a tab still open past close". The exact
 * service-day boundary (`businesses.service_day_cutoff`) is not on this
 * payload, so a tab opened at 01:00 on a night that runs past midnight will
 * read as yesterday's. Comparing calendar days in the venue's own timezone is
 * the honest approximation; the alternative is showing nothing at all.
 * Recorded in `docs/TODO.md` §7a.
 */
function openedOnAnEarlierServiceDay(
  openedAt: string,
  now: number,
  timeZone: string,
): boolean {
  const dayKey = (value: string | number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));

  return dayKey(openedAt) < dayKey(now);
}
