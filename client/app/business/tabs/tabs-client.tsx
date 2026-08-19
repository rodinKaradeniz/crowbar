"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Receipt, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRegionalSettings } from "@/contexts/regional-context";
import { useTabSocket } from "@/hooks/use-tab-socket";
import { formatBusinessDateTime } from "@/lib/business-time";
import { clientGetTab, clientListTabs, clientReopenTab, clientSettleTabExternally } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import type { Tab, TabSettledMethod } from "@/types";
import { TabOrderCompose } from "./tab-order-compose";

const METHODS: Array<{ value: TabSettledMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "mixed", label: "Mixed" },
  { value: "other", label: "Other" },
];

export function TabsClient({ businessId, businessTimezone, canReopen }: {
  businessId: string;
  businessTimezone: string;
  canReopen: boolean;
}) {
  const { currencyCode, locale } = useRegionalSettings();
  const money = (value: number | string) => formatMoney(value, currencyCode, locale);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [method, setMethod] = useState<TabSettledMethod | "not_recorded">("not_recorded");
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
      setLoadError(error instanceof Error ? error.message : "Failed to load tabs");
    } finally { setLoaded(true); }
  }, []);

  useEffect(() => { void refreshTabs(); }, [refreshTabs]);
  const { connected } = useTabSocket(businessId, refreshTabs);

  const upsertTab = useCallback((tab: Tab) => setTabs((current) => {
    const found = current.findIndex((candidate) => candidate.id === tab.id);
    if (found < 0) return [tab, ...current];
    const next = [...current]; next[found] = tab; return next;
  }), []);

  const refreshTab = useCallback(async (tabId: string) => {
    setBusy(true);
    try { upsertTab(await clientGetTab(tabId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Failed to refresh tab"); }
    finally { setBusy(false); }
  }, [upsertTab]);

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
      upsertTab(tab); setSettleOpen(false);
      toast.success("External settlement recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record external settlement");
    } finally { setBusy(false); }
  }

  async function reopen() {
    if (!selected || !reopenReason.trim()) return;
    setBusy(true);
    try {
      const tab = await clientReopenTab(selected.id, reopenReason.trim(), crypto.randomUUID());
      upsertTab(tab); setReopenOpen(false); setReopenReason("");
      toast.success("Tab reopened; the prior settlement record remains in history.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reopen tab");
    } finally { setBusy(false); }
  }

  if (!loaded) return <div className="page-pad text-sm text-muted-foreground">Loading tabs…</div>;

  return (
    <div className="page-pad">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="page-title">Tabs</h1><p className="mt-1 text-sm text-muted-foreground">Record external-register settlement while Crowbar retains the operational audit.</p></div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          {connected ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
          {connected ? "Live" : "Stale — reconnecting"}
        </div>
      </div>
      {loadError && <div className="mb-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive">{loadError}<Button variant="ghost" size="sm" onClick={() => void refreshTabs()}>Retry</Button></div>}

      {tabs.length === 0 ? <EmptyState icon={Receipt} title="No tabs" description="Start a tab from an occupied table on the Floor board." /> : (
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="space-y-2">{tabs.map((tab) => (
            <button key={tab.id} onClick={() => setSelectedId(tab.id)} className={`w-full rounded-lg border p-3 text-left transition-colors ${tab.id === selectedId ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
              <div className="flex justify-between"><span className="font-mono text-xs text-muted-foreground">#{tab.id.slice(0, 8)}</span><Badge variant={tab.status === "open" ? "default" : "secondary"}>{tab.status === "open" ? "Open" : "Settled externally"}</Badge></div>
              <div className="mt-1 flex justify-between text-sm"><span className="text-muted-foreground">{tab.orders.length} order{tab.orders.length === 1 ? "" : "s"}</span><span className="font-semibold">{money(tab.total)}</span></div>
            </button>
          ))}</div>

          {selected ? <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div><CardTitle className="font-mono text-base">Tab #{selected.id.slice(0, 8)}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Opened {formatBusinessDateTime(selected.openedAt, businessTimezone, locale)}{selected.seatingId ? " · seating tab" : " · standalone tab"}</p></div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => void refreshTab(selected.id)} disabled={busy}><RefreshCw className="size-4" /></Button>
                {selected.status === "open" && <><Button variant="outline" size="sm" onClick={() => setComposeOpen(true)}><Plus className="mr-1 size-4" />Add order</Button><Button size="sm" onClick={() => { setMethod("not_recorded"); setNote(""); setRegisterReference(""); setSettleOpen(true); }}>Settle externally</Button></>}
                {selected.status === "settled_externally" && canReopen && <Button variant="outline" size="sm" onClick={() => setReopenOpen(true)}>Reopen</Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selected.orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders on this tab yet.</p> : <ul className="divide-y">{selected.orders.map((order) => <li key={order.id} className="py-3"><div className="flex justify-between"><Badge variant="secondary">{order.status}</Badge><span className="font-medium">{money(order.totalAmount)}</span></div><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{order.lineItems.map((line) => <li key={line.id} className="flex justify-between"><span>{line.quantity}× {line.itemName}</span><span>{money(line.unitPrice * line.quantity)}</span></li>)}</ul></li>)}</ul>}
              <div className="flex justify-between border-t pt-3"><span className="text-sm font-medium">{selected.status === "open" ? "Running total" : "Current tab total"}</span><span className="text-lg font-semibold">{money(selected.total)}</span></div>
              {selected.settlementEvents.length > 0 && <div className="space-y-2 border-t pt-4"><p className="text-sm font-medium">Settlement audit history</p>{selected.settlementEvents.map((event) => <div key={event.id} className="rounded-md border p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-medium">{event.eventType === "settled_externally" ? "Settled externally" : "Reopened"}</span><span className="text-muted-foreground">{formatBusinessDateTime(event.occurredAt, businessTimezone, locale)}</span></div><p className="text-muted-foreground">Immutable snapshot: {money(event.totalSnapshot)} {event.currencyCode}</p>{event.informationalMethod && <p className="text-muted-foreground">Informational method: {event.informationalMethod}</p>}{event.externalRegisterReference && <p className="text-muted-foreground">Register reference: {event.externalRegisterReference}</p>}{event.note && <p className="text-muted-foreground">Note: {event.note}</p>}</div>)}</div>}
            </CardContent>
          </Card> : <div className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">Select a tab to view its orders.</div>}
        </div>
      )}

      {selected?.status === "open" && <TabOrderCompose businessId={businessId} tabId={selected.id} open={composeOpen} onOpenChange={setComposeOpen} onAdded={() => refreshTab(selected.id)} />}

      <Dialog open={settleOpen} onOpenChange={setSettleOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Settle externally</DialogTitle></DialogHeader><div className="space-y-3"><p className="text-sm text-muted-foreground">Record that the external register settled <span className="font-semibold text-foreground">{selected ? money(selected.total) : ""}</span>. Crowbar does not process this payment or issue a receipt.</p><Select value={method} onValueChange={(value) => setMethod(value as TabSettledMethod | "not_recorded")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="not_recorded">Method not recorded</SelectItem>{METHODS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Method is optional context only; it is not a tender or amount in Crowbar.</p><Input placeholder="External-register reference (optional)" value={registerReference} onChange={(event) => setRegisterReference(event.target.value)} /><Textarea placeholder="Note (optional)" value={note} onChange={(event) => setNote(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setSettleOpen(false)}>Cancel</Button><Button onClick={() => void settle()} disabled={busy}>Record external settlement</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Reopen tab</DialogTitle></DialogHeader><div className="space-y-2"><p className="text-sm text-muted-foreground">The prior external-settlement record remains immutable. Reopening allows economic changes while the linked seating is still open.</p><Textarea placeholder="Required reason" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button><Button onClick={() => void reopen()} disabled={busy || !reopenReason.trim()}>Reopen tab</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
