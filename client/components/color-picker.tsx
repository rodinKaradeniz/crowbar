"use client";

import { Check } from "lucide-react";

import {
  SERIES_HEX,
  SERIES_NAME,
  SERIES_SLOTS,
  seriesVar,
  slotForColor,
  type SeriesSlot,
} from "@/lib/series-palette";
import { cn } from "@/lib/utils";

/**
 * The service-type colour control.
 *
 * It offers the five declared series slots and nothing else. It previously
 * offered twelve arbitrary hues plus a free hex field and a native colour
 * well, which meant a venue could enter any colour in the sRGB gamut — the
 * single largest hole in rule zero, and the reason two of the old presets sat
 * close enough to the critical and attend fills to read as an alarm beside a
 * real one.
 *
 * The colour is stored as a hex string, so nothing about the persisted shape
 * changes; only the set of reachable values does. A service type coloured
 * before this control existed keeps rendering — `slotForColor` maps it to its
 * nearest declared slot — and re-picking here writes a declared value.
 *
 * Each swatch carries its name. Colour is never the sole carrier of meaning.
 */
interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Labels the group for assistive technology. */
  label?: string;
}

export function ColorPicker({
  value,
  onChange,
  label = "Colour",
}: ColorPickerProps) {
  const selected = slotForColor(value);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-[var(--space-8)]"
    >
      {SERIES_SLOTS.map((slot: SeriesSlot) => {
        const isSelected = selected === slot;
        return (
          <button
            key={slot}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(SERIES_HEX[slot])}
            className={cn(
              // 48px floor: this is a tablet control like any other.
              "flex min-h-[var(--control-desktop)] items-center gap-[var(--space-8)]",
              "rounded-[var(--radius-3)] border px-[var(--space-12)] py-[var(--space-8)]",
              "text-[length:var(--ui-size)] transition-colors",
              isSelected
                ? "border-primary bg-secondary"
                : "border-border hover:border-border-strong",
            )}
          >
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-[var(--radius-2)]"
              style={{ backgroundColor: seriesVar(slot) }}
            />
            <span>{SERIES_NAME[slot]}</span>
            {isSelected ? (
              <Check aria-hidden className="size-3.5 text-primary" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
