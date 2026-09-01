"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The reporting window every report renders against.
 *
 * Before stage 6 the analytics surfaces rendered one fixed period — 30 days, or
 * the current business day — which `docs/TODO.md` recorded as the main operator
 * complaint about them. Every report now takes its window from here and echoes
 * it back in the response, so a figure on screen always carries the range it
 * covers.
 *
 * Both ends are ISO strings in UTC. `start` is inclusive, `end` exclusive.
 */
export interface ReportRange {
  start: string;
  end: string;
  label: string;
}

const PRESETS = [
  { key: "today", label: "Today", days: 0 },
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "28", label: "Last 28 days", days: 28 },
  { key: "90", label: "Last 90 days", days: 90 },
] as const;

type PresetKey = (typeof PRESETS)[number]["key"] | "custom";

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function rangeForPreset(days: number, label: string): ReportRange {
  const end = new Date();
  const start = startOfToday();
  if (days > 0) start.setDate(start.getDate() - days);
  return { start: start.toISOString(), end: end.toISOString(), label };
}

/** The window a report opens on before the operator chooses one. */
export const DEFAULT_RANGE = rangeForPreset(28, "Last 28 days");

interface Props {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
}

export function ReportRangePicker({ value, onChange }: Props) {
  const [preset, setPreset] = useState<PresetKey>("28");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Guard the same rule the API enforces, so an impossible range is refused
  // here rather than round-tripping to a 422.
  const customIsValid = useMemo(() => {
    if (!customStart || !customEnd) return false;
    return new Date(customEnd) > new Date(customStart);
  }, [customStart, customEnd]);

  const applyCustom = () => {
    if (!customIsValid) return;
    const start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    // The end date the operator picked is inclusive in their head, so the
    // exclusive bound sent to the API is the following midnight.
    const end = new Date(customEnd);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    setPreset("custom");
    onChange({
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${customStart} to ${customEnd}`,
    });
  };

  return (
    <div className="flex flex-col gap-[var(--space-12)] border-y border-border py-[var(--space-12)] sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5">
        <CalendarRange
          className="mr-1 h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        {PRESETS.map((option) => (
          <Button
            key={option.key}
            type="button"
            size="filter"
            variant={preset === option.key ? "primary" : "secondary"}
            aria-pressed={preset === option.key}
            onClick={() => {
              setPreset(option.key);
              onChange(rangeForPreset(option.days, option.label));
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="report-range-start">
            From
          </Label>
          <Input
            id="report-range-start"
            type="date"
            className="h-[var(--control-desktop)] w-[9.5rem]"
            value={customStart}
            onChange={(event) => setCustomStart(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="report-range-end">
            To
          </Label>
          <Input
            id="report-range-end"
            type="date"
            className="h-[var(--control-desktop)] w-[9.5rem]"
            value={customEnd}
            onChange={(event) => setCustomEnd(event.target.value)}
          />
        </div>
        <Button
          type="button"
          size="filter"
          variant="secondary"
          disabled={!customIsValid}
          onClick={applyCustom}
        >
          Apply
        </Button>
      </div>

      <p className="sr-only" aria-live="polite">
        Showing {value.label}
      </p>
    </div>
  );
}

/**
 * The line under a figure that says what period it covers.
 *
 * Every report renders this. A number without its range is the thing the fixed
 * windows got wrong.
 */
export function RangeCaption({ range }: { range: ReportRange }) {
  return (
    <p className="type-label mt-1 text-muted-foreground">Showing {range.label.toLowerCase()}.</p>
  );
}
