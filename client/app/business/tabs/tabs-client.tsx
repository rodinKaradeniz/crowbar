"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import {
  clientListTabs,
  clientOpenTab,
  clientGetTab,
  clientCloseTab,
} from "@/lib/client-api";
import type { Tab, TabSettledMethod } from "@/types";
import { TabOrderCompose } from "./tab-order-compose";

const SETTLED_METHODS: { value: TabSettledMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "comp", label: "Comp" },
  { value: "other", label: "Other" },
];

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function TabsClient({ businessId }: { businessId: string }) {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [method, setMethod] = useState<TabSettledMethod>("card");

  const selected = tabs.find((t) => t.id === selectedId) ?? null;

  // Load the business's open tabs so they survive a page refresh.
  useEffect(() => {
    clientListTabs("open")
      .then(setTabs)
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "Failed to load tabs"),
      );
  }, []);

  function upsertTab(tab: Tab) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tab.id);
      if (idx === -1) return [tab, ...prev];
      const next = [...prev];
      next[idx] = tab;
      return next;
    });
  }

  async function handleOpenTab() {
    setBusy(true);
    try {
      const tab = await clientOpenTab();
      upsertTab(tab);
      setSelectedId(tab.id);
      toast.success("Tab opened");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open tab");
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh(tabId: string) {
    setBusy(true);
    try {
      const tab = await clientGetTab(tabId);
      upsertTab(tab);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh tab");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!selected) return;
    setBusy(true);
    try {
      const tab = await clientCloseTab(selected.id, method);
      upsertTab(tab);
      toast.success(`Tab closed · settled by ${method}`);
      setCloseOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to close tab");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tabs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group multiple orders under one running total and settle at the end.
          </p>
        </div>
        <Button onClick={handleOpenTab} disabled={busy}>
          <Plus className="size-4" />
          Open new tab
        </Button>
      </div>

      {tabs.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No open tabs"
          description="Open a tab to start grouping orders under a single running total."
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          {/* Tab list (this session) */}
          <div className="space-y-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  t.id === selectedId
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{t.id.slice(0, 8)}
                  </span>
                  <Badge variant={t.status === "open" ? "default" : "secondary"}>
                    {t.status}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t.orders.length} order{t.orders.length === 1 ? "" : "s"}
                  </span>
                  <span className="font-semibold">{money(t.total)}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Selected tab detail */}
          {selected ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="font-mono text-base">
                    Tab #{selected.id.slice(0, 8)}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Opened {new Date(selected.openedAt).toLocaleString()}
                    {selected.settledMethod
                      ? ` · settled by ${selected.settledMethod}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRefresh(selected.id)}
                    disabled={busy}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                  {selected.status === "open" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setComposeOpen(true)}
                        disabled={busy}
                      >
                        <Plus className="size-4" />
                        Add order
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setMethod("card");
                          setCloseOpen(true);
                        }}
                        disabled={busy}
                      >
                        Close tab
                      </Button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selected.orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No orders on this tab yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {selected.orders.map((o) => (
                      <li key={o.id} className="py-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary">{o.status}</Badge>
                          <span className="font-medium">
                            {money(o.totalAmount)}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {o.lineItems.map((li) => (
                            <li key={li.id} className="flex justify-between">
                              <span>
                                {li.quantity}× {li.itemName}
                              </span>
                              <span>{money(li.unitPrice * li.quantity)}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm font-medium">Running total</span>
                  <span className="text-lg font-semibold">
                    {money(selected.total)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Select a tab to view its orders.
            </div>
          )}
        </div>
      )}

      {/* Add-order compose dialog — reuses the shared cart logic + the standard
          order-placement path (happy-hour pricing applies; staff age-gate skip). */}
      {selected && selected.status === "open" && (
        <TabOrderCompose
          businessId={businessId}
          tabId={selected.id}
          open={composeOpen}
          onOpenChange={setComposeOpen}
          onAdded={() => handleRefresh(selected.id)}
        />
      )}

      {/* Close-tab settlement dialog (not a browser confirm) */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Close tab</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selected ? (
                <>
                  Settle{" "}
                  <span className="font-semibold text-foreground">
                    {money(selected.total)}
                  </span>{" "}
                  and close this tab.
                </>
              ) : null}
            </p>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as TabSettledMethod)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Settlement method" />
              </SelectTrigger>
              <SelectContent>
                {SETTLED_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClose} disabled={busy}>
              Close &amp; settle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
