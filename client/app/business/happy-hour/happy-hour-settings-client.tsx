"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { DAYS_OF_WEEK } from "@/lib/days";
import {
  clientGetHappyHourWindows,
  clientCreateHappyHourWindow,
  clientUpdateHappyHourWindow,
  clientDeleteHappyHourWindow,
} from "@/lib/client-api";
import { HappyHourWindow } from "@/types";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import Link from "next/link";
import { PageBody, PageHeader } from "@/components/page-header";

interface HappyHourSettingsClientProps {
  timezone: string;
}

type WindowForm = {
  name: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  isActive: boolean;
};

const emptyForm: WindowForm = {
  name: "",
  daysOfWeek: [],
  startTime: "16:00",
  endTime: "18:00",
  isActive: true,
};

function daysLabel(days: number[]): string {
  return DAYS_OF_WEEK.filter((d) => days.includes(d.index))
    .map((d) => d.short)
    .join(", ");
}

export default function HappyHourSettingsClient({
  timezone,
}: HappyHourSettingsClientProps) {
  const [windows, setWindows] = useState<HappyHourWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HappyHourWindow | null>(null);
  const [form, setForm] = useState<WindowForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HappyHourWindow | null>(null);

  useEffect(() => {
    clientGetHappyHourWindows()
      .then(setWindows)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(w: HappyHourWindow) {
    setEditing(w);
    setForm({
      name: w.name,
      daysOfWeek: w.daysOfWeek,
      startTime: w.startTime,
      endTime: w.endTime,
      isActive: w.isActive,
    });
    setDialogOpen(true);
  }

  function toggleDay(index: number) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(index)
        ? f.daysOfWeek.filter((d) => d !== index)
        : [...f.daysOfWeek, index].sort((a, b) => a - b),
    }));
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (form.daysOfWeek.length === 0) {
      toast.error("Select at least one day");
      return;
    }
    if (form.startTime === form.endTime) {
      toast.error("Start and end time can't be the same");
      return;
    }
    // start > end is a valid overnight window (wraps past midnight), so it is allowed.
    setSaving(true);
    try {
      if (editing) {
        const updated = await clientUpdateHappyHourWindow(editing.id, {
          name: form.name.trim(),
          daysOfWeek: form.daysOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          isActive: form.isActive,
        });
        setWindows((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      } else {
        const created = await clientCreateHappyHourWindow({
          name: form.name.trim(),
          daysOfWeek: form.daysOfWeek,
          startTime: form.startTime,
          endTime: form.endTime,
          isActive: form.isActive,
        });
        setWindows((prev) => [...prev, created]);
      }
      setDialogOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(w: HappyHourWindow) {
    try {
      await clientDeleteHappyHourWindow(w.id);
      setWindows((prev) => prev.filter((x) => x.id !== w.id));
      toast.success("Happy hour window deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Happy hour windows"
        description={
          <>
            When the discount runs. The discounted price itself is set per item
            in{" "}
            <Link
              href="/business/menu"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              the menu &rarr;
            </Link>
          </>
        }
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> New window
          </Button>
        }
      />

      <PageBody>
        {/*
          HAPPY HOUR IS TWO HALVES, AND THIS IS THE "WHEN".
          This page owns the windows — which days, what times — and is the only UI
          for the /happy-hour/windows endpoints. The other half, the discounted
          price per item, lives in the menu item form, which has linked HERE since
          it was built. The trip back did not exist, so the page read like a
          duplicate of the menu rather than the schedule behind it.
        */}
        {loading ? (
          <SkeletonList rows={4} columns={["w-[30%]", "w-[22%]", "w-[18%]"]} />
        ) : windows.length === 0 ? (
          <EmptyState
            title="No happy hour windows"
            description="A window is when the discount runs. Items only fall to their happy-hour price inside one, so nothing is discounted until you add the first."
            action={{ label: "New window", onClick: openCreate }}
            secondaryAction={{ label: "Set item prices in the menu", href: "/business/menu" }}
          />
        ) : (
          <div className="space-y-2">
            {windows.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{w.name}</p>
                    {!w.isActive && (
                      <Badge tone="neutral" className="text-xs">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {daysLabel(w.daysOfWeek)} · {w.startTime}–{w.endTime}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(w)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(w)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit happy hour window" : "New happy hour window"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="hh-name">Name</Label>
                <Input
                  id="hh-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Weekday early bird"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((d) => (
                    <button
                      key={d.index}
                      type="button"
                      onClick={() => toggleDay(d.index)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                        form.daysOfWeek.includes(d.index)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-muted-foreground/40"
                      }`}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="hh-start">Start time</Label>
                  <Input
                    id="hh-start"
                    type="time"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, startTime: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hh-end">End time</Label>
                  <Input
                    id="hh-end"
                    type="time"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endTime: e.target.value }))
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Times are in {timezone}. Change it in Business Information settings.
              </p>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="hh-active"
                  checked={form.isActive}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, isActive: !!v }))
                  }
                />
                <Label htmlFor="hh-active" className="text-sm">
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save changes" : "Create window"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConfirmationDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete happy hour window"
          description={`"${deleteTarget?.name}" will be permanently deleted.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => {
            if (deleteTarget) void confirmDelete(deleteTarget);
            setDeleteTarget(null);
          }}
        />
      </PageBody>
    </>
  );
}
