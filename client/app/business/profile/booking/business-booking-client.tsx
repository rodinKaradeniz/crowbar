"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { DAYS_OF_WEEK } from "@/lib/days";
import { PageBody, PageHeader } from "@/components/page-header";
import {
  clientCopyOperatingHoursToDefault,
  clientDeleteServiceBookingSchedule,
  clientGetOperatingHoursPreview,
  clientReplaceDefaultBookingSchedule,
  clientReplaceServiceBookingSchedule,
  clientUpdateBusiness,
} from "@/lib/client-api";
import type {
  BookingOperatingHoursPreview,
  BookingSchedule,
  BookingScheduleCollection,
  BookingScheduleDraft,
  BookingTimeWindow,
  Business,
  ServiceType,
} from "@/types";

interface BusinessBookingClientProps {
  businessId: string;
  initialBusiness: Business;
  serviceTypes: ServiceType[];
  initialSchedules: BookingScheduleCollection;
  canEdit: boolean;
}

function toDraft(schedule: BookingSchedule): BookingScheduleDraft {
  return {
    minimumNoticeMinutes: schedule.minimumNoticeMinutes,
    advanceBookingDays: schedule.advanceBookingDays,
    slotIntervalMinutes: schedule.slotIntervalMinutes,
    defaultDurationMinutes: schedule.defaultDurationMinutes,
    cancellationWindowMinutes: schedule.cancellationWindowMinutes,
    arrivalGracePeriodMinutes: schedule.arrivalGracePeriodMinutes,
    reminderEnabled: schedule.reminderEnabled,
    reminderLeadMinutes: schedule.reminderLeadMinutes,
    reconfirmationEnabled: schedule.reconfirmationEnabled,
    windows: schedule.windows.map((window) => ({ ...window })),
    exceptions: schedule.exceptions.map((exception) => ({
      ...exception,
      windows: exception.windows.map((window) => ({ ...window })),
    })),
  };
}

function nextDay(startTime: string, endTime: string) {
  return endTime < startTime;
}

function WindowEditor({
  windows,
  onChange,
  disabled,
  includeDay,
}: {
  windows: BookingTimeWindow[];
  onChange: (windows: BookingTimeWindow[]) => void;
  disabled: boolean;
  includeDay?: number;
}) {
  const update = (index: number, key: "startTime" | "endTime", value: string) => {
    onChange(
      windows.map((window, candidate) => {
        if (candidate !== index) return window;
        const updated = { ...window, [key]: value };
        return {
          ...updated,
          endsNextDay: nextDay(updated.startTime, updated.endTime),
        };
      }),
    );
  };

  return (
    <div className="space-y-2">
      {windows.map((window, index) => (
        <div key={`${window.id ?? "new"}-${index}`} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Opening time"
            type="time"
            value={window.startTime}
            onChange={(event) => update(index, "startTime", event.target.value)}
            disabled={disabled}
            className="w-32"
            required
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            aria-label="Closing time"
            type="time"
            value={window.endTime}
            onChange={(event) => update(index, "endTime", event.target.value)}
            disabled={disabled}
            className="w-32"
            required
          />
          {window.endsNextDay && (
            <span className="text-xs text-muted-foreground">next day</span>
          )}
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove time window"
              onClick={() => onChange(windows.filter((_, candidate) => candidate !== index))}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button
          type="button"
          variant="secondary"
          size="filter"
          onClick={() =>
            onChange([
              ...windows,
              {
                ...(includeDay == null ? {} : { weekday: includeDay }),
                startTime: "18:00",
                endTime: "20:00",
                endsNextDay: false,
              },
            ])
          }
        >
          <Plus /> Add window
        </Button>
      )}
    </div>
  );
}

function WindowSummary({ windows }: { windows: Array<BookingTimeWindow & { weekday: number }> }) {
  if (windows.length === 0) return <span>Closed every day</span>;
  return (
    <div className="space-y-1">
      {DAYS_OF_WEEK.map((day) => {
        const dayWindows = windows.filter((window) => window.weekday === day.index);
        if (dayWindows.length === 0) return null;
        return (
          <div key={day.index}>
            <span className="font-medium">{day.short}:</span>{" "}
            {dayWindows
              .map(
                (window) =>
                  `${window.startTime}–${window.endTime}${window.endsNextDay ? " (+1)" : ""}`,
              )
              .join(", ")}
          </div>
        );
      })}
    </div>
  );
}

export default function BusinessBookingClient({
  businessId,
  initialBusiness,
  serviceTypes,
  initialSchedules,
  canEdit,
}: BusinessBookingClientProps) {
  const router = useRouter();
  const [schedules, setSchedules] = useState(initialSchedules);
  const [scope, setScope] = useState("default");
  const [draft, setDraft] = useState(() => toDraft(initialSchedules.defaultSchedule));
  const [customEnabled, setCustomEnabled] = useState(true);
  const [maxGuests, setMaxGuests] = useState(String(initialBusiness.maxGuests));
  const [saving, setSaving] = useState(false);
  const [savingPartySize, setSavingPartySize] = useState(false);
  const [publicReservationsEnabled, setPublicReservationsEnabled] = useState(
    initialBusiness.publicReservationsEnabled,
  );
  const [savingPublicReservations, setSavingPublicReservations] = useState(false);
  const [confirmDisablePublicReservations, setConfirmDisablePublicReservations] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [preview, setPreview] = useState<BookingOperatingHoursPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copyingHours, setCopyingHours] = useState(false);

  const selectedService = useMemo(
    () => serviceTypes.find((service) => service.id === scope),
    [scope, serviceTypes],
  );
  const selectedOverride = useMemo(
    () => schedules.serviceOverrides.find((schedule) => schedule.serviceTypeId === scope),
    [scope, schedules.serviceOverrides],
  );
  const editable = canEdit && (scope === "default" || customEnabled);

  useEffect(() => {
    if (scope === "default") {
      setDraft(toDraft(schedules.defaultSchedule));
      setCustomEnabled(true);
      return;
    }
    const override = schedules.serviceOverrides.find(
      (schedule) => schedule.serviceTypeId === scope,
    );
    setDraft(toDraft(override ?? schedules.defaultSchedule));
    setCustomEnabled(Boolean(override));
  }, [scope, schedules]);

  const updateDraftNumber = (
    key:
      | "minimumNoticeMinutes"
      | "advanceBookingDays"
      | "slotIntervalMinutes"
      | "defaultDurationMinutes"
      | "cancellationWindowMinutes"
      | "arrivalGracePeriodMinutes"
      | "reminderLeadMinutes",
    value: string,
  ) => setDraft((current) => ({ ...current, [key]: Number(value) }));

  const saveSchedule = async () => {
    setSaving(true);
    try {
      const saved =
        scope === "default"
          ? await clientReplaceDefaultBookingSchedule(draft)
          : await clientReplaceServiceBookingSchedule(scope, draft);
      setSchedules((current) =>
        scope === "default"
          ? { ...current, defaultSchedule: saved }
          : {
              ...current,
              serviceOverrides: [
                ...current.serviceOverrides.filter(
                  (schedule) => schedule.serviceTypeId !== scope,
                ),
                saved,
              ],
            },
      );
      setCustomEnabled(true);
      toast.success(scope === "default" ? "Default schedule saved" : "Booking type schedule saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save booking schedule");
    } finally {
      setSaving(false);
    }
  };

  const revertOverride = async () => {
    if (scope === "default") return;
    try {
      await clientDeleteServiceBookingSchedule(scope);
      setSchedules((current) => ({
        ...current,
        serviceOverrides: current.serviceOverrides.filter(
          (schedule) => schedule.serviceTypeId !== scope,
        ),
      }));
      setDraft(toDraft(schedules.defaultSchedule));
      setCustomEnabled(false);
      toast.success("Booking type now uses the business default");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revert schedule");
    }
  };

  const savePartySize = async () => {
    setSavingPartySize(true);
    try {
      const value = Number(maxGuests);
      if (!Number.isInteger(value) || value < 1) throw new Error("Maximum party size must be at least 1");
      await clientUpdateBusiness(businessId, { maxGuests: value });
      toast.success("Maximum party size saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save maximum party size");
    } finally {
      setSavingPartySize(false);
    }
  };

  const savePublicReservations = async (enabled: boolean) => {
    setSavingPublicReservations(true);
    try {
      await clientUpdateBusiness(businessId, { publicReservationsEnabled: enabled });
      setPublicReservationsEnabled(enabled);
      toast.success(enabled ? "Online reservations enabled" : "Online reservations disabled");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update public reservation access");
    } finally {
      setSavingPublicReservations(false);
    }
  };

  const openCopyPreview = async () => {
    setLoadingPreview(true);
    try {
      setPreview(await clientGetOperatingHoursPreview());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to preview operating hours");
    } finally {
      setLoadingPreview(false);
    }
  };

  const copyOperatingHours = async () => {
    setCopyingHours(true);
    try {
      const saved = await clientCopyOperatingHoursToDefault();
      setSchedules((current) => ({ ...current, defaultSchedule: saved }));
      setDraft(toDraft(saved));
      setPreview(null);
      toast.success("Weekly booking hours replaced from operating hours");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to copy operating hours");
    } finally {
      setCopyingHours(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Booking Configuration"
        description="Manage reservation policy, weekly availability, and one-off exceptions."
      />

      <PageBody>
        {!canEdit && (
          <div className="border bg-muted/40 p-4 text-sm text-muted-foreground">
            You have read-only access. An owner or manager can change booking configuration.
          </div>
        )}

        <div className="border bg-card p-4">
          <label className="mb-2 block text-sm font-medium" htmlFor="booking-scope">
            Configuration scope
          </label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger id="booking-scope" className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Business default</SelectItem>
              {serviceTypes.map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            Times use {initialBusiness.timezone ?? "UTC"}. Booking types inherit the business default until customized.
          </p>
        </div>

        {scope !== "default" && (
          <div className="flex flex-col gap-3 border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{selectedService?.name}</p>
              <p className="text-sm text-muted-foreground">
                {customEnabled
                  ? "This booking type has its own complete schedule."
                  : "This booking type currently inherits the business default."}
              </p>
            </div>
            {canEdit && (
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={customEnabled}
                  onChange={(event) => {
                    if (!event.target.checked && selectedOverride) {
                      setConfirmRevert(true);
                    } else {
                      setCustomEnabled(event.target.checked);
                      setDraft(toDraft(schedules.defaultSchedule));
                    }
                  }}
                  className="size-4 rounded border-input"
                />
                Use custom schedule
              </label>
            )}
          </div>
        )}

        <Tabs defaultValue="policy">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="policy">Policy</TabsTrigger>
            <TabsTrigger value="weekly">Weekly Hours</TabsTrigger>
            <TabsTrigger value="exceptions">Date Exceptions</TabsTrigger>
          </TabsList>

          <TabsContent value="policy" className="space-y-4 pt-4">
            {scope === "default" && (
              <>
                <section className="border bg-card p-4">
                  <h2 className="font-semibold">Public online bookings</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {publicReservationsEnabled
                      ? "Guests can use your public reservation page. Staff can always create and manage reservations."
                      : "Only staff can create reservations; guests see a contact-the-venue message instead of booking slots."}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                    <p className="text-sm font-medium">
                      {publicReservationsEnabled ? "Accepting online reservations" : "Staff-only reservation book"}
                    </p>
                    {canEdit && (
                      <Button
                        type="button"
                        variant={publicReservationsEnabled ? "secondary" : "primary"}
                        disabled={savingPublicReservations}
                        onClick={() => {
                          if (publicReservationsEnabled) setConfirmDisablePublicReservations(true);
                          else void savePublicReservations(true);
                        }}
                      >
                        {savingPublicReservations
                          ? "Saving…"
                          : publicReservationsEnabled
                            ? "Make staff-only"
                            : "Enable online bookings"}
                      </Button>
                    )}
                  </div>
                </section>

                <section className="border bg-card p-4">
                  <h2 className="font-semibold">Business-wide party limit</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This caps every reservation; a booking type&apos;s capacity can lower it further.
                  </p>
                  <div className="mt-4 flex max-w-sm items-end gap-2">
                    <label className="flex-1 text-sm font-medium">
                      Maximum party size
                      <Input
                        type="number"
                        min="1"
                        value={maxGuests}
                        onChange={(event) => setMaxGuests(event.target.value)}
                        disabled={!canEdit}
                        className="mt-2"
                      />
                    </label>
                    {canEdit && (
                      <Button type="button" variant="secondary" onClick={savePartySize} disabled={savingPartySize}>
                        {savingPartySize ? "Saving…" : "Save limit"}
                      </Button>
                    )}
                  </div>
                </section>
              </>
            )}

            <section className="border bg-card p-4">
              <h2 className="font-semibold">Scheduling policy</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {([
                  ["minimumNoticeMinutes", "Minimum notice", "Minutes before a booking"],
                  ["advanceBookingDays", "Booking horizon", "Days customers can book ahead"],
                  ["slotIntervalMinutes", "Slot interval", "Minutes between offered start times"],
                  ["defaultDurationMinutes", "Default duration", "Minutes reserved when the type has no duration"],
                ] as const).map(([key, label, help]) => (
                  <label key={key} className="text-sm font-medium">
                    {label}
                    <Input
                      type="number"
                      min={key === "minimumNoticeMinutes" ? 0 : 1}
                      value={draft[key]}
                      onChange={(event) => updateDraftNumber(key, event.target.value)}
                      disabled={!editable}
                      className="mt-2"
                    />
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">{help}</span>
                  </label>
                ))}
              </div>
              {scope !== "default" && selectedService && (
                <div className="mt-5 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  Maximum party: {selectedService.capacity} guests · {selectedService.availabilityResourceMode === "tables" ? "Table-backed availability" : selectedService.availabilityResourceMode === "covers" ? `${selectedService.reservableCoverCapacity} reservable covers` : "Needs resource setup"} · Duration: {selectedService.duration ?? draft.defaultDurationMinutes} min. Manage these service controls on the{" "}
                  <Link href="/business/profile/types" className="font-medium text-foreground underline underline-offset-4">
                    Booking Types page
                  </Link>
                  .
                </div>
              )}
            </section>

            <section className="border bg-card p-4">
              <h2 className="font-semibold">Reservation protection</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Guests can still cancel or reschedule until their reservation starts; changes inside the window are recorded as late so staff can respond.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["cancellationWindowMinutes", "Late-change window", "Minutes before arrival that count as late"],
                  ["arrivalGracePeriodMinutes", "Arrival grace period", "Minutes after start before staff can mark no-show"],
                  ["reminderLeadMinutes", "Reminder lead time", "Minutes before arrival"],
                ] as const).map(([key, label, help]) => (
                  <label key={key} className="text-sm font-medium">
                    {label}
                    <Input
                      type="number"
                      min={key === "reminderLeadMinutes" ? 1 : 0}
                      value={draft[key]}
                      onChange={(event) => updateDraftNumber(key, event.target.value)}
                      disabled={!editable}
                      className="mt-2"
                    />
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">{help}</span>
                  </label>
                ))}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.reminderEnabled}
                    onChange={(event) => setDraft((current) => ({ ...current, reminderEnabled: event.target.checked }))}
                    disabled={!editable}
                    className="mt-0.5 size-4 rounded border-input"
                  />
                  <span><span className="block font-medium">Send reminder</span><span className="text-muted-foreground">Send the configured transactional reminder before the reservation.</span></span>
                </label>
                <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.reconfirmationEnabled}
                    onChange={(event) => setDraft((current) => ({ ...current, reconfirmationEnabled: event.target.checked }))}
                    disabled={!editable}
                    className="mt-0.5 size-4 rounded border-input"
                  />
                  <span><span className="block font-medium">Allow guest reconfirmation</span><span className="text-muted-foreground">Show “I&apos;m still coming” on the secure reservation link; no reply never cancels a booking.</span></span>
                </label>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="weekly" className="space-y-4 pt-4">
            <section className="border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-semibold">Recurring weekly hours</h2>
                  <p className="text-sm text-muted-foreground">
                    Add multiple windows for split service. An end time before its start continues into the next day.
                  </p>
                </div>
                {scope === "default" && canEdit && (
                  <Button type="button" variant="secondary" onClick={openCopyPreview} disabled={loadingPreview}>
                    <Copy /> {loadingPreview ? "Loading…" : "Copy operating hours"}
                  </Button>
                )}
              </div>
              <div className="mt-5 divide-y rounded-md border">
                {DAYS_OF_WEEK.map((day) => {
                  const dayWindows = draft.windows.filter((window) => window.weekday === day.index);
                  return (
                    <div key={day.index} className="grid gap-3 p-4 md:grid-cols-[8rem_1fr]">
                      <div>
                        <p className="font-medium">{day.label}</p>
                        {dayWindows.length === 0 && <p className="text-xs text-muted-foreground">Closed</p>}
                      </div>
                      <WindowEditor
                        windows={dayWindows}
                        includeDay={day.index}
                        disabled={!editable}
                        onChange={(windows) =>
                          setDraft((current) => ({
                            ...current,
                            windows: [
                              ...current.windows.filter((window) => window.weekday !== day.index),
                              ...windows.map((window) => ({ ...window, weekday: day.index })),
                            ],
                          }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="exceptions" className="space-y-4 pt-4">
            <section className="border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Date exceptions</h2>
                  <p className="text-sm text-muted-foreground">
                    Close a date or replace its recurring hours with custom windows.
                  </p>
                </div>
                {editable && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        exceptions: [
                          ...current.exceptions,
                          { localDate: "", isClosed: true, windows: [] },
                        ],
                      }))
                    }
                  >
                    <Plus /> Add exception
                  </Button>
                )}
              </div>
              {draft.exceptions.length === 0 ? (
                <p className="mt-6 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No date exceptions configured.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {draft.exceptions.map((exception, index) => (
                    <div key={`${exception.id ?? "new"}-${index}`} className="rounded-md border p-4">
                      <div className="flex flex-wrap items-end gap-4">
                        <label className="text-sm font-medium">
                          Date
                          <Input
                            type="date"
                            value={exception.localDate}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                exceptions: current.exceptions.map((item, candidate) =>
                                  candidate === index ? { ...item, localDate: event.target.value } : item,
                                ),
                              }))
                            }
                            disabled={!editable}
                            className="mt-2 w-44"
                            required
                          />
                        </label>
                        <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={exception.isClosed}
                            onChange={(event) =>
                              setDraft((current) => ({
                                ...current,
                                exceptions: current.exceptions.map((item, candidate) =>
                                  candidate === index
                                    ? {
                                        ...item,
                                        isClosed: event.target.checked,
                                        windows: event.target.checked
                                          ? []
                                          : [{ startTime: "18:00", endTime: "20:00", endsNextDay: false }],
                                      }
                                    : item,
                                ),
                              }))
                            }
                            disabled={!editable}
                            className="size-4 rounded border-input"
                          />
                          Closed all day
                        </label>
                        {editable && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove date exception"
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                exceptions: current.exceptions.filter((_, candidate) => candidate !== index),
                              }))
                            }
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                      {!exception.isClosed && (
                        <div className="mt-4">
                          <WindowEditor
                            windows={exception.windows}
                            disabled={!editable}
                            onChange={(windows) =>
                              setDraft((current) => ({
                                ...current,
                                exceptions: current.exceptions.map((item, candidate) =>
                                  candidate === index ? { ...item, windows } : item,
                                ),
                              }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>

        {editable && (
          <div className="flex justify-end">
            <Button type="button" onClick={saveSchedule} disabled={saving}>
              {saving ? "Saving…" : scope === "default" ? "Save default schedule" : "Save custom schedule"}
            </Button>
          </div>
        )}

        <ConfirmationDialog
          open={confirmDisablePublicReservations}
          onOpenChange={setConfirmDisablePublicReservations}
          title="Make reservations staff-only?"
          description="Guests will no longer see booking slots or be able to submit reservations from your public page. Staff booking and table planning stay available."
          confirmLabel="Make staff-only"
          variant="destructive"
          onConfirm={() => void savePublicReservations(false)}
        />

        <ConfirmationDialog
          open={confirmRevert}
          onOpenChange={setConfirmRevert}
          title="Revert to the business default?"
          description={`This deletes the custom schedule for ${selectedService?.name ?? "this booking type"}. Future changes to the business default will then apply.`}
          confirmLabel="Revert schedule"
          onConfirm={revertOverride}
          variant="destructive"
        />

        <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Replace weekly booking hours?</DialogTitle>
              <DialogDescription>
                This copies the current operating hours once. Policy and date exceptions stay unchanged, and later operating-hour edits will not sync automatically.
              </DialogDescription>
            </DialogHeader>
            {preview && (
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="mb-2 font-medium">Current booking hours</p>
                  <WindowSummary windows={preview.currentWindows} />
                </div>
                <div className="rounded-md border p-3">
                  <p className="mb-2 font-medium">Proposed operating hours</p>
                  <WindowSummary windows={preview.proposedWindows} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setPreview(null)} disabled={copyingHours}>
                Cancel
              </Button>
              <Button type="button" onClick={copyOperatingHours} disabled={copyingHours}>
                {copyingHours ? "Replacing…" : "Replace weekly hours"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </>
  );
}
