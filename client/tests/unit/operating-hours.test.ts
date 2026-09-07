import { describe, expect, it } from "vitest";
import { collapseOperatingHours } from "@/lib/operating-hours";

const open = (o: string, c: string) => ({ open: o, close: c });
const closed = { closed: true } as const;

describe("collapseOperatingHours", () => {
  it("collapses a week of identical hours into one line", () => {
    // The demo venue. Seven identical rows said one thing seven times.
    const week = Object.fromEntries(
      ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
        (day) => [day, open("17:00", "02:00")],
      ),
    );

    expect(collapseOperatingHours(week)).toEqual([
      { label: "Monday – Sunday", value: "17:00 – 02:00" },
    ]);
  });

  it("keeps a day with different hours on its own line", () => {
    expect(
      collapseOperatingHours({
        monday: open("17:00", "02:00"),
        tuesday: open("17:00", "02:00"),
        wednesday: open("12:00", "23:00"),
        thursday: open("17:00", "02:00"),
      }),
    ).toEqual([
      { label: "Monday – Tuesday", value: "17:00 – 02:00" },
      { label: "Wednesday", value: "12:00 – 23:00" },
      { label: "Thursday", value: "17:00 – 02:00" },
    ]);
  });

  it("does not merge equal days across a closed day between them", () => {
    // The correctness case. "Monday – Wednesday · 17:00 – 02:00" would be a
    // claim about Tuesday, and it would be false.
    expect(
      collapseOperatingHours({
        monday: open("17:00", "02:00"),
        tuesday: closed,
        wednesday: open("17:00", "02:00"),
      }),
    ).toEqual([
      { label: "Monday", value: "17:00 – 02:00" },
      { label: "Tuesday", value: "Closed" },
      { label: "Wednesday", value: "17:00 – 02:00" },
    ]);
  });

  it("does not merge equal days across a day the venue never configured", () => {
    // Absent is not the same as equal: nothing is known about Tuesday, so the
    // run has to break there too.
    expect(
      collapseOperatingHours({
        monday: open("17:00", "02:00"),
        wednesday: open("17:00", "02:00"),
      }),
    ).toEqual([
      { label: "Monday", value: "17:00 – 02:00" },
      { label: "Wednesday", value: "17:00 – 02:00" },
    ]);
  });

  it("merges a run of closed days", () => {
    expect(
      collapseOperatingHours({
        monday: closed,
        tuesday: closed,
        wednesday: open("17:00", "02:00"),
      }),
    ).toEqual([
      { label: "Monday – Tuesday", value: "Closed" },
      { label: "Wednesday", value: "17:00 – 02:00" },
    ]);
  });

  it("reads the week Monday-first regardless of key order", () => {
    expect(
      collapseOperatingHours({
        sunday: open("12:00", "22:00"),
        monday: open("17:00", "02:00"),
      }).map((run) => run.label),
    ).toEqual(["Monday", "Sunday"]);
  });

  it("returns nothing for a venue with no configured hours", () => {
    expect(collapseOperatingHours({})).toEqual([]);
  });
});
