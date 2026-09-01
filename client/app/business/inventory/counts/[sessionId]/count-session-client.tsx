"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, Upload } from "lucide-react";

import {
  clientGetCountSession,
  clientGetPackConversions,
  clientReconcileCountSession,
  clientSaveCountLines,
} from "@/lib/client-api";
import type { CountLine, CountSession, PackConversion } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SkeletonList } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmationDialog } from "@/components/confirmation-dialog";

type EntryMode = "base_unit" | "pack" | "keg_level";

type LineDraft = {
  mode: EntryMode;
  value: string;
  packConversionId: string;
  shrinkageReason: string;
  note: string;
};

const SHRINKAGE_REASONS = ["spillage", "breakage", "spoilage", "wrong_measure", "other"];

interface Props {
  businessId: string;
  sessionId: string;
  canManage: boolean;
}

export function CountSessionClient({ businessId, sessionId, canManage }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<CountSession | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [packs, setPacks] = useState<Record<string, PackConversion[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReconcile, setConfirmReconcile] = useState(false);

  const seedDrafts = useCallback((loaded: CountSession) => {
    setDrafts(
      Object.fromEntries(
        loaded.lines.map((line) => [
          line.id,
          {
            mode: line.entryMode,
            value: String(
              line.entryMode === "base_unit" ? line.countedQuantity : (line.entryValue ?? ""),
            ),
            packConversionId: line.entryPackConversionId ?? "",
            shrinkageReason: line.shrinkageReason ?? "",
            note: line.note ?? "",
          } satisfies LineDraft,
        ]),
      ),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await clientGetCountSession(businessId, sessionId);
      setSession(loaded);
      seedDrafts(loaded);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this count");
    } finally {
      setLoading(false);
    }
  }, [businessId, sessionId, seedDrafts]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadPacks(itemId: string) {
    if (packs[itemId]) return;
    try {
      const loaded = await clientGetPackConversions(businessId, itemId);
      setPacks((prev) => ({ ...prev, [itemId]: loaded }));
    } catch {
      toast.error("Could not load pack sizes");
    }
  }

  const counted = useMemo(
    () => (session ? session.lines.filter((line) => drafts[line.id]?.value !== "").length : 0),
    [session, drafts],
  );

  async function save() {
    if (!session) return;
    const payload = session.lines
      .map((line) => ({ line, draft: drafts[line.id] }))
      .filter(({ draft }) => draft && draft.value !== "" && !Number.isNaN(Number(draft.value)))
      .map(({ line, draft }) => ({
        countLineId: line.id,
        ...(draft.mode === "pack"
          ? { packConversionId: draft.packConversionId, packQuantity: Number(draft.value) }
          : draft.mode === "keg_level"
            ? { kegLevelPercent: Number(draft.value) }
            : { countedQuantity: Number(draft.value) }),
        shrinkageReason: draft.shrinkageReason || undefined,
        note: draft.note || undefined,
      }));

    if (payload.length === 0) {
      toast.error("Enter at least one count");
      return;
    }
    const packMissing = payload.some(
      (entry) => "packQuantity" in entry && !entry.packConversionId,
    );
    if (packMissing) {
      toast.error("Choose a pack size for every pack count");
      return;
    }

    setSaving(true);
    try {
      const updated = await clientSaveCountLines(businessId, sessionId, payload);
      setSession(updated);
      seedDrafts(updated);
      toast.success("Count saved");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not save the count");
    } finally {
      setSaving(false);
    }
  }

  async function reconcile() {
    try {
      const updated = await clientReconcileCountSession(businessId, sessionId);
      setSession(updated);
      seedDrafts(updated);
      toast.success("Count reconciled. Variance posted to the stock ledger.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not reconcile the count");
    }
  }

  async function exportSheet() {
    // Served through the authenticated proxy, so this cannot be a plain link.
    try {
      const response = await fetch(
        `/api/proxy/inventory/${businessId}/counts/${sessionId}/sheet`,
      );
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `count-${sessionId}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not export the count sheet");
    }
  }

  async function importSheet(file: File) {
    const body = new FormData();
    body.append("file", file);
    try {
      const response = await fetch(
        `/api/proxy/inventory/${businessId}/counts/${sessionId}/sheet`,
        { method: "POST", body },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail ?? detail?.message ?? "Import failed");
      }
      toast.success("Count sheet imported");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not import the sheet");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        <SkeletonList rows={6} columns={["w-[32%]", "w-[18%]", "w-[16%]", "w-[14%]"]} />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen p-6 max-w-md mx-auto flex flex-col gap-4 justify-center">
        <div className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error ?? "This count could not be loaded."}
        </div>
        <Button variant="secondary" onClick={() => router.push("/business/inventory")}>
          Back to Inventory
        </Button>
      </div>
    );
  }

  const isOpen = session.status === "open";

  return (
    <div className="min-h-screen bg-background pb-32">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="filter"
            className="h-9 w-9 p-0 shrink-0"
            onClick={() => router.push("/business/inventory")}
            aria-label="Back to inventory"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">
              {session.kind === "stocktake" ? "Stocktake" : "Cycle count"}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {counted}/{session.lines.length}
              </span>{" "}
              counted
            </div>
          </div>
          <Badge
            tone="neutral"
            className={isOpen ? "text-foreground shrink-0" : "text-muted-foreground shrink-0"}
          >
            {isOpen ? "Open" : session.status === "reconciled" ? "Reconciled" : "Cancelled"}
          </Badge>
        </div>
      </div>

      <div className="px-4 py-6 max-w-md mx-auto flex flex-col gap-4">
        {isOpen && (
          <div className="flex gap-2">
            <Button variant="secondary" size="filter" className="flex-1" onClick={exportSheet}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            <Button
              variant="secondary"
              size="filter"
              className="flex-1"
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Import CSV
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importSheet(file);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {session.lines.map((line) => (
          <CountLineCard
            key={line.id}
            line={line}
            draft={drafts[line.id]}
            packs={packs[line.inventoryItemId] ?? []}
            readOnly={!isOpen}
            onFocusPacks={() => void loadPacks(line.inventoryItemId)}
            onChange={(next) => setDrafts((prev) => ({ ...prev, [line.id]: next }))}
          />
        ))}
      </div>

      {isOpen && (
        <div className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t">
          <div className="p-4 max-w-md mx-auto flex gap-2">
            <Button variant="secondary" size="md" className="flex-1" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {canManage && (
              <Button size="md" className="flex-1" onClick={() => setConfirmReconcile(true)}>
                <Check className="h-4 w-4 mr-1.5" />
                Reconcile
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={confirmReconcile}
        onOpenChange={setConfirmReconcile}
        title="Reconcile this count?"
        description="Every difference between the count and the ledger is posted as a stock movement. This cannot be undone."
        confirmLabel="Reconcile"
        onConfirm={reconcile}
      />
    </div>
  );
}

function CountLineCard({
  line,
  draft,
  packs,
  readOnly,
  onFocusPacks,
  onChange,
}: {
  line: CountLine;
  draft?: LineDraft;
  packs: PackConversion[];
  readOnly: boolean;
  onFocusPacks: () => void;
  onChange: (next: LineDraft) => void;
}) {
  const current: LineDraft = draft ?? {
    mode: "base_unit",
    value: "",
    packConversionId: "",
    shrinkageReason: "",
    note: "",
  };
  const entered = Number(current.value);
  // Preview the variance while counting, so a keying slip is obvious on the
  // shelf rather than at reconcile time.
  const previewBase =
    current.mode === "pack"
      ? entered * (packs.find((p) => p.id === current.packConversionId)?.baseQuantity ?? 0)
      : current.mode === "keg_level"
        ? null
        : entered;
  const variance =
    previewBase === null || current.value === "" || Number.isNaN(entered)
      ? null
      : previewBase - line.bookQuantity;

  return (
    <div className="border p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{line.itemName}</div>
          <div className="text-xs text-muted-foreground">
            Book: <span className="font-mono tabular-nums">{line.bookQuantity}</span> {line.baseUnit}
          </div>
        </div>
        {variance !== null && variance !== 0 && (
          <Badge tone="neutral" className={variance < 0 ? "text-foreground" : "text-foreground"}>
            {variance > 0 ? "+" : ""}
            {variance.toFixed(3)}
          </Badge>
        )}
      </div>

      {readOnly ? (
        <div className="text-sm">
          Counted <span className="font-mono tabular-nums">{line.countedQuantity}</span> {line.baseUnit}
          {line.varianceQuantity !== 0 && (
            <span className="text-muted-foreground">
              {" "}
              · variance <span className="font-mono tabular-nums">{line.varianceQuantity}</span>
            </span>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <Select
              value={current.mode}
              onValueChange={(mode) => {
                if (mode === "pack") onFocusPacks();
                onChange({ ...current, mode: mode as EntryMode, value: "" });
              }}
            >
              <SelectTrigger className="w-[130px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base_unit">{line.baseUnit}</SelectItem>
                <SelectItem value="pack">Packs</SelectItem>
                <SelectItem value="keg_level">Keg %</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-10 flex-1 font-mono tabular-nums"
              inputMode="decimal"
              placeholder="Count"
              value={current.value}
              onChange={(e) => onChange({ ...current, value: e.target.value })}
            />
          </div>

          {current.mode === "pack" && (
            <Select
              value={current.packConversionId}
              onValueChange={(id) => onChange({ ...current, packConversionId: id })}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Which pack?" />
              </SelectTrigger>
              <SelectContent>
                {packs.map((pack) => (
                  <SelectItem key={pack.id} value={pack.id}>
                    {pack.label} ({pack.baseQuantity} {line.baseUnit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {variance !== null && variance < 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`reason-${line.id}`}>Shrinkage reason</Label>
              <Select
                value={current.shrinkageReason}
                onValueChange={(reason) => onChange({ ...current, shrinkageReason: reason })}
              >
                <SelectTrigger id={`reason-${line.id}`} className="h-10">
                  <SelectValue placeholder="Required for a shortfall" />
                </SelectTrigger>
                <SelectContent>
                  {SHRINKAGE_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}
    </div>
  );
}
